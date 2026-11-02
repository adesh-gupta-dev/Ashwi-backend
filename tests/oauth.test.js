import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import 'dotenv/config';
import { createOAuthHandlers } from '../src/controllers/oauthController.js';
import { oauthConfig, allowedOAuthRedirect } from '../src/config/oauth.js';
import { hashOAuthValue, oauthStore } from '../src/models/oauthModel.js';
import { pool, query } from '../src/config/db.js';

const redirectUri='http://localhost:3000/oauth/callback';
const settings=oauthConfig({PORT:'5000',CLIENT_URL:'http://localhost:3000',GOOGLE_CLIENT_ID:'test-google',GOOGLE_CLIENT_SECRET:'test-secret',GITHUB_CLIENT_ID:'test-github',GITHUB_CLIENT_SECRET:'test-secret'});
const verifier='a'.repeat(64), challenge=hashOAuthValue(verifier);
const identity={provider:'google',subject:'provider-subject',email:'oauth@example.invalid',name:'OAuth Test'};
function response(){return {statusCode:200,headers:{},set(value){Object.assign(this.headers,value);return this;},status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;},redirect(status,url){this.statusCode=status;this.location=url;return this;}};}
function fixture(){
  const attempts=new Map(),handoffs=new Map();let resolutions=0;
  const store={
    createAttempt:async a=>attempts.set(a.stateHash,{provider:a.provider,provider_verifier:a.verifier,nonce:a.nonce,redirect_uri:a.redirectUri,client_challenge:a.challenge,link_user_id:a.userId}),
    consumeAttempt:async (key,provider)=>{const a=attempts.get(key);if(a?.provider!==provider)return null;attempts.delete(key);return a;},
    createHandoff:async (key,a,value)=>handoffs.set(key,{identity:value,client_challenge:a.client_challenge,link_user_id:a.link_user_id}),
    consumeHandoff:async(key,c)=>{const value=handoffs.get(key);if(value?.client_challenge!==c)return null;handoffs.delete(key);return value;},
    resolveIdentity:async()=>{resolutions++;return {user:{id:'test-user',email:identity.email,name:identity.name,role:'user',is_verified:true}};},
  };
  return {attempts,handoffs,store,get resolutions(){return resolutions;},handlers:createOAuthHandlers({store,config:()=>settings,getIdentity:async()=>identity,signToken:()=> 'ashwi-session'})};
}
async function start(f,provider='google',extra={}){const res=response();await f.handlers.start({params:{provider},body:{redirectUri,codeChallenge:challenge},...extra},res);return res;}
async function callback(f,state,extra={}){const res=response();const query={state,code:'test-code',...extra};await f.handlers.callback({params:{provider:'google'},query,originalUrl:`/api/auth/oauth/google/callback?${new URLSearchParams(query)}`},res);return res;}

test('redirects require an exact allowlisted callback, with no query, credentials or fragment',()=>{
 assert(allowedOAuthRedirect(redirectUri,settings));
 for(const uri of ['https://evil.invalid/oauth/callback',redirectUri+'?next=evil',redirectUri+'#fragment','http://localhost:3000.evil.invalid/oauth/callback','javascript:alert(1)'])assert.equal(allowedOAuthRedirect(uri,settings),false);
});
test('unconfigured providers fail clearly without starting authorization',async()=>{
 const f=fixture();const handlers=createOAuthHandlers({store:f.store,config:()=>oauthConfig({})});const res=response();
 await handlers.start({params:{provider:'google'},body:{redirectUri,codeChallenge:challenge}},res);assert.equal(res.statusCode,503);assert.equal(f.attempts.size,0);
});
test('Google and GitHub requests use PKCE and server callback, without exposing secrets',async()=>{
 for(const provider of ['google','github']){const f=fixture();const res=await start(f,provider);const url=new URL(res.body.authorizationUrl);
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),`http://localhost:5000/api/auth/oauth/${provider}/callback`);
 assert.equal(url.searchParams.get('state').length,43);assert(!res.body.authorizationUrl.includes('test-secret'));assert.equal(f.attempts.size,1);}
});
test('state mismatch, wrong provider, expired and replayed callbacks do not resolve accounts',async()=>{
 const f=fixture();const begin=await start(f);const state=new URL(begin.body.authorizationUrl).searchParams.get('state');
 assert.equal((await callback(f,'z'.repeat(43))).statusCode,400);
 const wrong=response();await f.handlers.callback({params:{provider:'github'},query:{state},originalUrl:'/'},wrong);assert.equal(wrong.statusCode,400);
 assert.equal((await callback(f,state)).statusCode,303);assert.equal((await callback(f,state)).statusCode,400);assert.equal(f.resolutions,0);
});
test('cancellation returns a safe error and consumes state',async()=>{
 const f=fixture();const begin=await start(f);const state=new URL(begin.body.authorizationUrl).searchParams.get('state');const res=await callback(f,state,{error:'access_denied'});
 assert.equal(res.location,redirectUri+'?error=denied');assert.equal(f.handoffs.size,0);assert.equal(f.resolutions,0);
});
test('handoff requires the app proof, is one-use, and returns JWT only in JSON',async()=>{
 const f=fixture();const begin=await start(f);const state=new URL(begin.body.authorizationUrl).searchParams.get('state');const cb=await callback(f,state);
 const ticket=new URL(cb.location).searchParams.get('ticket');assert(ticket);assert(!cb.location.includes('ashwi-session'));assert.equal(f.resolutions,0);
 const bad=response();await f.handlers.exchange({body:{ticket,codeVerifier:'x'.repeat(64)}},bad);assert.equal(bad.statusCode,400);assert.equal(f.resolutions,0);
 const good=response();await f.handlers.exchange({body:{ticket,codeVerifier:verifier}},good);assert.equal(good.body.token,'ashwi-session');assert.equal(f.resolutions,1);assert.equal(good.headers['Cache-Control'],'no-store');
 const replay=response();await f.handlers.exchange({body:{ticket,codeVerifier:verifier}},replay);assert.equal(replay.statusCode,400);
});
test('linking requires verified Ashwi ownership and defers mutation until proof exchange',async()=>{
 const f=fixture();const rejected=await start(f,'google',{user:{id:'existing-user',is_verified:false}});assert.equal(rejected.statusCode,403);
 const begin=await start(f,'google',{user:{id:'existing-user',is_verified:true}});const state=new URL(begin.body.authorizationUrl).searchParams.get('state');await callback(f,state);
 assert.equal(f.resolutions,0);assert.equal([...f.handoffs.values()][0].link_user_id,'existing-user');
});
test('provider failures return generic feedback, without provider exception details',async()=>{
 const f=fixture();f.handlers=createOAuthHandlers({store:f.store,config:()=>settings,getIdentity:async()=>{throw Error('secret-provider-token');}});
 const begin=await start(f);const state=new URL(begin.body.authorizationUrl).searchParams.get('state');const res=await callback(f,state);
 assert.equal(res.location,redirectUri+'?error=failed');assert(!JSON.stringify(res).includes('secret-provider-token'));
});

const created=[];
after(async()=>{for(const id of created)await query('DELETE FROM users WHERE id = ?',[id]);await pool.end();});
test('PostgreSQL: first and concurrent OAuth sign-ins share one identity; explicit linking protects existing accounts',async()=>{
 const suffix=crypto.randomUUID();const profile={provider:'google',subject:`test-${suffix}`,email:`oauth-${suffix}@example.invalid`,name:'OAuth regression'};
 const [a,b]=await Promise.all([oauthStore.resolveIdentity(profile,null),oauthStore.resolveIdentity(profile,null)]);
 if(a.user)created.push(a.user.id);if(b.user && b.user.id!==a.user?.id)created.push(b.user.id);
 assert.equal(a.user.id,b.user.id);assert.equal(a.user.password_hash,null);assert.equal(a.user.is_verified,true);
 const github={...profile,provider:'github',subject:`test-gh-${suffix}`};
 assert.equal((await oauthStore.resolveIdentity(github,null)).error,'account_exists');
 assert.equal((await oauthStore.resolveIdentity(github,a.user.id)).user.id,a.user.id);
 assert.equal((await oauthStore.identities(a.user.id)).length,2);
 await query('UPDATE users SET is_active=FALSE WHERE id=?',[a.user.id]);
 assert.equal((await oauthStore.resolveIdentity(profile,null)).error,'account_unavailable');
});
test('PostgreSQL: expired state and handoff records cannot be used',async()=>{
 const state=hashOAuthValue(crypto.randomUUID()),ticket=hashOAuthValue(crypto.randomUUID());
 try{
 await query(`INSERT INTO oauth_attempts (state_hash,provider,provider_verifier,nonce,redirect_uri,client_challenge,expires_at) VALUES (?,'google','verifier','nonce',?,?,NOW()-INTERVAL '1 second')`,[state,redirectUri,challenge]);
 await query(`INSERT INTO oauth_handoffs (ticket_hash,client_challenge,identity,expires_at) VALUES (?,?,?,NOW()-INTERVAL '1 second')`,[ticket,challenge,JSON.stringify(identity)]);
 assert.equal(await oauthStore.consumeAttempt(state,'google'),undefined);assert.equal(await oauthStore.consumeHandoff(ticket,challenge),undefined);
 }finally{await query('DELETE FROM oauth_attempts WHERE state_hash=?',[state]);await query('DELETE FROM oauth_handoffs WHERE ticket_hash=?',[ticket]);}
});
