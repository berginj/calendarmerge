import { describe, it, expect } from "vitest";
import { normalizeFeedUrl, validateFeedUrlTarget } from "../../src/lib/util";

describe("SSRF Protection", () => {
  describe("IPv4 private addresses", () => {
    it("should reject localhost", () => {
      expect(() => normalizeFeedUrl("http://localhost/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("https://localhost:8080/cal.ics")).toThrow("private");
    });

    it("should reject 127.0.0.0/8 loopback", () => {
      expect(() => normalizeFeedUrl("http://127.0.0.1/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://127.1.1.1/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://127.255.255.255/cal.ics")).toThrow("private");
    });

    it("should reject 10.0.0.0/8 private class A", () => {
      expect(() => normalizeFeedUrl("http://10.0.0.1/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://10.255.255.255/cal.ics")).toThrow("private");
    });

    it("should reject 172.16.0.0/12 private class B", () => {
      expect(() => normalizeFeedUrl("http://172.16.0.1/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://172.31.255.255/cal.ics")).toThrow("private");
    });

    it("should reject 192.168.0.0/16 private class C", () => {
      expect(() => normalizeFeedUrl("http://192.168.0.1/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://192.168.255.255/cal.ics")).toThrow("private");
    });

    it("should reject 169.254.0.0/16 link-local", () => {
      expect(() => normalizeFeedUrl("http://169.254.1.1/calendar.ics")).toThrow("private");
    });

    it("should reject 0.0.0.0", () => {
      expect(() => normalizeFeedUrl("http://0.0.0.0/calendar.ics")).toThrow("private");
    });
  });

  describe("IPv6 private addresses", () => {
    it("should reject ::1 loopback", () => {
      expect(() => normalizeFeedUrl("http://[::1]/calendar.ics")).toThrow("private");
      // Note: Without brackets, ::1 fails URL parsing before our validation
      expect(() => normalizeFeedUrl("http://::1/calendar.ics")).toThrow(); // Fails URL parse
    });

    it("should reject fe80::/10 link-local", () => {
      expect(() => normalizeFeedUrl("http://[fe80::1]/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://[fe80:1234::1]/cal.ics")).toThrow("private");
    });

    it("should reject fc00::/7 unique local", () => {
      expect(() => normalizeFeedUrl("http://[fc00::1]/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://[fd00::1]/calendar.ics")).toThrow("private");
    });

    it("should reject ff00::/8 multicast", () => {
      expect(() => normalizeFeedUrl("http://[ff00::1]/calendar.ics")).toThrow("private");
      expect(() => normalizeFeedUrl("http://[ff02::1]/calendar.ics")).toThrow("private");
    });
  });

  describe("Public URLs", () => {
    it("should allow public domain names", () => {
      expect(normalizeFeedUrl("https://example.com/calendar.ics"))
        .toBe("https://example.com/calendar.ics");

      expect(normalizeFeedUrl("https://calendar.google.com/ical/xyz.ics"))
        .toBe("https://calendar.google.com/ical/xyz.ics");
    });

    it("should allow webcal protocol (converts to https)", () => {
      expect(normalizeFeedUrl("webcal://example.com/cal.ics"))
        .toBe("https://example.com/cal.ics");

      expect(normalizeFeedUrl("webcals://example.com/cal.ics"))
        .toBe("https://example.com/cal.ics");
    });

    it("should allow URLs with query parameters and tokens", () => {
      expect(normalizeFeedUrl("https://example.com/cal.ics?token=abc123"))
        .toBe("https://example.com/cal.ics?token=abc123");
    });
  });

  describe("DNS target validation", () => {
    it("should reject public hostnames that resolve to private addresses", async () => {
      await expect(
        validateFeedUrlTarget("https://calendar.example.com/cal.ics", async () => [
          { address: "10.0.0.5", family: 4 },
        ]),
      ).rejects.toThrow("resolves to private");
    });

    it("should allow public hostnames that resolve to public addresses", async () => {
      await expect(
        validateFeedUrlTarget("https://calendar.example.com/cal.ics", async () => [
          { address: "93.184.216.34", family: 4 },
        ]),
      ).resolves.toBe("https://calendar.example.com/cal.ics");
    });
  });
});
