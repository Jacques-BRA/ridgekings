import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type KeyObject } from "jose";
import { verifyCfAccessJwt, _setJwksGetterForTests } from "./cf-access";

const TEAM = "test.cloudflareaccess.com";
const AUD = "test-aud";
const KID = "test-kid";

let trustedPrivateKey: KeyObject;
let untrustedPrivateKey: KeyObject;

beforeAll(async () => {
  const trusted = await generateKeyPair("ES256", { extractable: true });
  const untrusted = await generateKeyPair("ES256", { extractable: true });
  trustedPrivateKey = trusted.privateKey as KeyObject;
  untrustedPrivateKey = untrusted.privateKey as KeyObject;

  const jwk = await exportJWK(trusted.publicKey);
  jwk.alg = "ES256";
  jwk.kid = KID;
  jwk.use = "sig";
  const local = createLocalJWKSet({ keys: [jwk] });
  // jose's getter type is identical to what `verifyCfAccessJwt` expects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _setJwksGetterForTests(local as any);
});

afterAll(() => {
  _setJwksGetterForTests(null);
});

async function signValid(claims: Record<string, unknown>, key: KeyObject = trustedPrivateKey): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: KID })
    .setIssuer(`https://${TEAM}`)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

describe("verifyCfAccessJwt — happy path", () => {
  it("extracts the lowercased email and sub from a valid token", async () => {
    const token = await signValid({ email: "User.Name@Example.COM", sub: "uid-42" });
    const id = await verifyCfAccessJwt(token);
    expect(id.email).toBe("user.name@example.com");
    expect(id.sub).toBe("uid-42");
  });

  it("uses the name claim when present", async () => {
    const token = await signValid({ email: "x@y.com", sub: "u-1", name: "Will Smith" });
    const id = await verifyCfAccessJwt(token);
    expect(id.name).toBe("Will Smith");
  });

  it("derives a name from the email local-part when no name claim is set", async () => {
    const token = await signValid({ email: "jacques.potgieter@example.com", sub: "u-2" });
    const id = await verifyCfAccessJwt(token);
    expect(id.name).toBe("Jacques Potgieter");
  });
});

describe("verifyCfAccessJwt — rejection", () => {
  it("rejects a token signed by an untrusted key", async () => {
    const token = await signValid({ email: "x@y.com", sub: "u-x" }, untrustedPrivateKey);
    await expect(verifyCfAccessJwt(token)).rejects.toThrow();
  });

  it("rejects a token with the wrong audience", async () => {
    const token = await new SignJWT({ email: "x@y.com", sub: "u-1" })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setIssuer(`https://${TEAM}`)
      .setAudience("wrong-aud")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(trustedPrivateKey);
    await expect(verifyCfAccessJwt(token)).rejects.toThrow();
  });

  it("rejects a token with the wrong issuer", async () => {
    const token = await new SignJWT({ email: "x@y.com", sub: "u-1" })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setIssuer("https://attacker.example.com")
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(trustedPrivateKey);
    await expect(verifyCfAccessJwt(token)).rejects.toThrow();
  });

  it("rejects a token missing the email claim", async () => {
    const token = await signValid({ sub: "u-1" });
    await expect(verifyCfAccessJwt(token)).rejects.toThrow(/email/i);
  });

  it("rejects a token missing the sub claim", async () => {
    const token = await new SignJWT({ email: "x@y.com" })
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(trustedPrivateKey);
    await expect(verifyCfAccessJwt(token)).rejects.toThrow(/sub/i);
  });
});
