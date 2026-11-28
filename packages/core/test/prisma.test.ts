import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePrismaSchema } from '../src/prisma/parser';

// PRODUCTCREATOR-21: the parser uses @prisma/prisma-schema-wasm instead of @prisma/internals
let dir: string | undefined;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function schemaFile(content: string): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-prisma-'));
  const file = path.join(dir, 'schema.prisma');
  fs.writeFileSync(file, content);
  return file;
}

describe('parsePrismaSchema', () => {
  it('extracts models, mapped names and field attributes (datasource without url, Prisma 7 style)', async () => {
    const file = schemaFile(`
datasource db {
  provider = "postgresql"
}

/// A registered user
model User {
  id    String @id @default(uuid())
  email String @unique @map("email_address")
  posts Post[]
  @@map("users")
}

model Post {
  id       Int     @id @default(autoincrement())
  title    String?
  author   User    @relation(fields: [authorId], references: [id])
  authorId String
}
`);
    const models = await parsePrismaSchema(file);
    expect(models.map((m) => m.name)).toEqual(['User', 'Post']);
    const user = models[0];
    expect(user.attributes).toContainEqual({ name: '@@map', args: ['users'] });
    expect(user.fields.map((f) => f.name)).toEqual(['id', 'email', 'posts']);
    expect(JSON.stringify(user)).toContain('email_address');
  });

  it('turns enum fields into enum<…> types (PRODUCTCREATOR-34)', async () => {
    const file = schemaFile(`
datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  MEMBER
}

model Account {
  id    Int    @id
  role  Role
  roles Role[]
}
`);
    const [account] = await parsePrismaSchema(file);
    expect(account.fields.find((f) => f.name === 'role')).toMatchObject({ type: 'enum<ADMIN|MEMBER>', isList: false });
    expect(account.fields.find((f) => f.name === 'roles')).toMatchObject({ type: 'enum<ADMIN|MEMBER>', isList: true });
  });

  it('reports schema errors with a readable message', async () => {
    const file = schemaFile('model {');
    await expect(parsePrismaSchema(file)).rejects.toThrow(/Failed to parse Prisma schema .*schema\.prisma/);
  });
});
