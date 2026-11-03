Supabase Root 2021 CA (public certificate, expires April 26, 2031).

Downloaded over HTTPS from:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 fingerprint:
80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA

Supabase documents the CA requirement at:
https://supabase.com/docs/guides/platform/ssl-enforcement

The backend attaches this trust root only to Supabase PostgreSQL hosts without
an explicit sslrootcert. Certificate and hostname verification remain enabled.
