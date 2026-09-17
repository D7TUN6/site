export function AUTH_MD_TEMPLATE(base: string): string {
  const BT = '`'
  return (
    '# auth.md\n' +
    '\n' +
    'You are an agent. This service supports **agentic registration** for D7TUN6 — a personal artist and music platform.\n' +
    '\n' +
    'Base URL: ' + base + '\n' +
    '\n' +
    '## Discovery\n' +
    '\n' +
    'Fetch the Protected Resource Metadata:\n' +
    '\n' +
    '```http\n' +
    'GET /.well-known/oauth-protected-resource\n' +
    '```\n' +
    '\n' +
    'Then fetch the Authorization Server metadata from the ' + BT + 'authorization_servers' + BT + ' URL:\n' +
    '\n' +
    '```http\n' +
    'GET /.well-known/oauth-authorization-server\n' +
    '```\n' +
    '\n' +
    '## Supported methods\n' +
    '\n' +
    '### service_auth (verified email)\n' +
    '\n' +
    "Register with the user's email address. A claim ceremony binds the agent to the user's authenticated session.\n" +
    '\n' +
    '```http\n' +
    'POST /api/auth/register\n' +
    'Content-Type: application/json\n' +
    '\n' +
    '{\n' +
    '  "type": "service_auth",\n' +
    '  "login_hint": "user@example.com"\n' +
    '}\n' +
    '```\n' +
    '\n' +
    'The response includes a ' + BT + 'claim' + BT + ' block with a ' + BT + 'user_code' + BT + ' and ' + BT + 'verification_uri' + BT + '. Surface these to the user — they sign in, enter the code, and the agent receives an access token.\n' +
    '\n' +
    '### anonymous\n' +
    '\n' +
    'Register without a user identity. Later claim the registration to unlock post-claim scopes.\n' +
    '\n' +
    '```http\n' +
    'POST /api/auth/register\n' +
    'Content-Type: application/json\n' +
    '\n' +
    '{ "type": "anonymous" }\n' +
    '```\n' +
    '\n' +
    '## Claim ceremony\n' +
    '\n' +
    'After registration with ' + BT + 'service_auth' + BT + ' or when claiming an anonymous registration:\n' +
    '\n' +
    '```http\n' +
    'POST /agent/identity/claim\n' +
    'Content-Type: application/json\n' +
    '\n' +
    '{\n' +
    '  "claim_token": "clm_...",\n' +
    '  "email": "user@example.com"\n' +
    '}\n' +
    '```\n' +
    '\n' +
    'The user opens ' + BT + 'verification_uri' + BT + ', signs in, and enters the ' + BT + 'user_code' + BT + '. Poll the token endpoint until the ceremony completes.\n' +
    '\n' +
    '## Token exchange\n' +
    '\n' +
    'Exchange the service-signed identity assertion for an access token:\n' +
    '\n' +
    '```http\n' +
    'POST /api/auth/login\n' +
    'Content-Type: application/x-www-form-urlencoded\n' +
    '\n' +
    'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer\n' +
    '&assertion=<identity_assertion>\n' +
    '```\n' +
    '\n' +
    '## Use the access token\n' +
    '\n' +
    '```http\n' +
    'GET /api/resource\n' +
    'Authorization: Bearer <access_token>\n' +
    '```\n' +
    '\n' +
    '## Revocation\n' +
    '\n' +
    'Revoke an access token:\n' +
    '\n' +
    '```http\n' +
    'POST /api/auth/logout\n' +
    'Content-Type: application/x-www-form-urlencoded\n' +
    '\n' +
    'token=<access_token>\n' +
    '&token_type_hint=access_token\n' +
    '```\n'
  )
}
