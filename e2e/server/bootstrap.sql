-- Minimal tenant for the SDK E2E harness. Run after migrations and after the SpiceDB schema is
-- applied (up.sh does both). Every id and the API key are fixed test-only values; lib.sh holds the
-- same workspace id and the plaintext key.
--
-- API key fbk_sdk_e2e_qa_fixed_test_secret_not_for_prod_0001:
--   lookupHash = sha256_hex(secret without "fbk_"), hashedKey = bcrypt(secret, cost 12).
BEGIN;

INSERT INTO "Organization" ("id", "created_at", "updated_at", "name")
VALUES ('clsdkqaorg0000000000000001', now(), now(), 'SDK E2E');

INSERT INTO "Workspace" ("id", "created_at", "updated_at", "name", "organizationId", "config", "recontactDays")
VALUES ('clsdkqaws00000000000000001', now(), now(), 'SDK E2E', 'clsdkqaorg0000000000000001',
        '{"channel":"app","industry":null}', 0);

-- The app's createWorkspace adds a default language and these default attribute keys. userId is
-- required: setUserId connects the new contact to the userId key and fails with a 500 without it.
INSERT INTO "Language" ("id", "created_at", "updated_at", "code", "alias", "workspaceId")
VALUES ('clsdkqalng0000000000000001', now(), now(), 'en-US', NULL, 'clsdkqaws00000000000000001');

INSERT INTO "ContactAttributeKey" ("id", "created_at", "updated_at", "isUnique", "key", "name", "description", "type", "workspaceId") VALUES
  ('clsdkqacak0000000000000001', now(), now(), true,  'userId',    'User Id',    'The user id of a contact',             'default', 'clsdkqaws00000000000000001'),
  ('clsdkqacak0000000000000002', now(), now(), true,  'email',     'Email',      'The email of a contact',               'default', 'clsdkqaws00000000000000001'),
  ('clsdkqacak0000000000000003', now(), now(), false, 'firstName', 'First Name', 'Your contact''s first name',           'default', 'clsdkqaws00000000000000001'),
  ('clsdkqacak0000000000000004', now(), now(), false, 'lastName',  'Last Name',  'Your contact''s last name',            'default', 'clsdkqaws00000000000000001'),
  ('clsdkqacak0000000000000005', now(), now(), false, 'language',  'Language',   'The language preference of a contact', 'default', 'clsdkqaws00000000000000001');

INSERT INTO "ApiKey" ("id", "label", "hashedKey", "lookupHash", "organizationId")
VALUES ('clsdkqakey0000000000000001', 'sdk-e2e',
        '$2b$12$Zm5iuKbsrD0Ee20.uwUna.Ftm9Hw2BbmpC8Wu.JOXVChAx9E.BYym',
        '495b8708751454b2cec91b0fd372f6cfb85a5ce6c0050827e85ba82c3dbe4227',
        'clsdkqaorg0000000000000001');

INSERT INTO "ApiKeyWorkspace" ("id", "updatedAt", "apiKeyId", "workspaceId", "permission")
VALUES ('clsdkqaakw0000000000000001', now(), 'clsdkqakey0000000000000001', 'clsdkqaws00000000000000001', 'manage');

COMMIT;
