import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { oauthConfig } from '../src/config/oauth.js';
import { fetchProviderIdentity } from '../src/services/oauthProvider.js';

const config=oauthConfig({GOOGLE_CLIENT_ID:'google-test',GOOGLE_CLIENT_SECRET:'secret',GITHUB_CLIENT_ID:'github-test',GITHUB_CLIENT_SECRET:'secret'});
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const attempt={provider_verifier:'a'.repeat(64),nonce:'expected-nonce'};
const params=new URLSearchParams({code:'provider-code',state:'test-state'});

test('production provider callbacks ignore stale localhost configuration', () => {
 for (const deployment of [{NODE_ENV:'production'}, {VERCEL:'1'}]) {
  const settings=oauthConfig({...deployment, OAUTH_PUBLIC_API_URL:'http://localhost:5000', API_BASE_URL:'http://localhost:5000', BACKEND_PUBLIC_URL:'http://localhost:5000'});
  for (const provider of ['google','github']) {
   assert.equal(settings.providers[provider].callback, `https://ashwiapi.vercel.app/api/auth/oauth/${provider}/callback`);
  }
 }
});

test('production uses the first valid public API URL and local development retains localhost', () => {
 assert.equal(oauthConfig({NODE_ENV:'production', OAUTH_PUBLIC_API_URL:'http://localhost:5000', API_BASE_URL:'https://api.example.com/'}).providers.google.callback, 'https://api.example.com/api/auth/oauth/google/callback');
 assert.equal(oauthConfig({NODE_ENV:'production', OAUTH_PUBLIC_API_URL:'https://oauth.example.com', API_BASE_URL:'https://api.example.com'}).providers.google.callback, 'https://oauth.example.com/api/auth/oauth/google/callback');
 assert.equal(oauthConfig({PORT:'5000'}).providers.google.callback, 'http://localhost:5000/api/auth/oauth/google/callback');
});
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}

test('Google checks token audience/nonce and requires matching verified userinfo subject',async()=>{
 const original=globalThis.fetch;
 let nonce='expected-nonce',subject='google-subject',verified=true;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/token')) {
   const body=new URLSearchParams(options.body);assert.equal(body.get('code_verifier'),attempt.provider_verifier);assert.equal(body.get('client_secret'),'secret');
   return json({access_token:'google-token',token_type:'Bearer',expires_in:3600,id_token:jwt.sign({sub:'google-subject',nonce},privateKey,{algorithm:'RS256',issuer:'https://accounts.google.com',audience:'google-test',expiresIn:300})});
  }
  assert.equal(options.headers.Authorization,'Bearer google-token');
  return json({sub:subject,email:'User@example.invalid',name:'Test User',email_verified:verified});
 };
 try{
  const value=await fetchProviderIdentity('google',config.providers.google,params,attempt);assert.equal(value.email,'user@example.invalid');
  verified=false;assert.equal(await fetchProviderIdentity('google',config.providers.google,params,attempt),null);
  verified=true;subject='wrong-subject';assert.equal(await fetchProviderIdentity('google',config.providers.google,params,attempt),null);
  nonce='wrong-nonce';await assert.rejects(fetchProviderIdentity('google',config.providers.google,params,attempt));
 }finally{globalThis.fetch=original;}
});
test('GitHub uses its verified primary email, including when profile email is private',async()=>{
 const original=globalThis.fetch;let verified=true;
 globalThis.fetch=async url=>{
  if(String(url).endsWith('/access_token'))return json({access_token:'github-token',token_type:'bearer',scope:'read:user,user:email'});
  if(String(url).endsWith('/user/emails'))return json([{email:'private@example.invalid',primary:true,verified},{email:'unverified@example.invalid',primary:false,verified:false}]);
  return json({id:123,login:'test-github',name:'GitHub Test',email:null});
 };
 try{const value=await fetchProviderIdentity('github',config.providers.github,params,attempt);assert.equal(value.email,'private@example.invalid');assert.equal(value.subject,'123');verified=false;assert.equal(await fetchProviderIdentity('github',config.providers.github,params,attempt),null);}
 finally{globalThis.fetch=original;}
});
