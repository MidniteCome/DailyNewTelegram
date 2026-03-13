import fs from "node:fs/promises";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { normalizeHealth, normalizeItem } from "./base.mjs";

/**
 * Email newsletter adapter via IMAP
 *
 * Reads emails from a mailbox folder, filters by sender, extracts content.
 * Requires IMAP credentials in config or environment variables.
 */

async function fetchNewslettersFromImap(config) {
  const {
    host,
    port = 993,
    secure = true,
    user,
    password,
    folder = "INBOX",
    maxAge = 7, // days
    senders = [], // filter by sender addresses
  } = config;

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass: password },
    logger: false,
  });

  const items = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAge);

  try {
    await client.connect();

    const lock = await client.getMailboxLock(folder);
    try {
      // Search for recent emails
      const searchCriteria = { since: cutoffDate };
      
      for await (const message of client.fetch(searchCriteria, {
        envelope: true,
        source: true,
      })) {
        const envelope = message.envelope;
        const fromAddress = envelope.from?.[0]?.address?.toLowerCase() || "";
        
        // Filter by sender if senders list is provided
        if (senders.length > 0) {
          const matchesSender = senders.some(s => 
            fromAddress.includes(s.toLowerCase())
          );
          if (!matchesSender) continue;
        }

        // Parse email content
        const parsed = await simpleParser(message.source);
        
        // Extract text content (prefer plain text, fall back to HTML stripped)
        let content = parsed.text || "";
        if (!content && parsed.html) {
          content = parsed.html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500);
        }
        
        // Clean up HTML entities
        content = content
          .replace(/&#\d+;/g, " ")       // Remove numeric entities like &#8202;
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, '"')
          .replace(/\s+/g, " ")
          .trim();

        // Extract first link as the "read more" link
        const linkMatch = parsed.html?.match(/href="(https?:\/\/[^"]+)"/i);
        const link = linkMatch?.[1] || "";

        items.push(
          normalizeItem({
            source: `newsletter:${envelope.from?.[0]?.name || fromAddress}`,
            sourceType: "email",
            title: envelope.subject || "(no subject)",
            link: link,
            pubDate: envelope.date || new Date(),
            summary: content.slice(0, 300),
            author: envelope.from?.[0]?.name || fromAddress,
          })
        );
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error) {
    await client.logout().catch(() => {});
    throw error;
  }

  return items;
}

export async function fetchEmail({ enabled = false, configPath = "sources/newsletters.json" } = {}) {
  if (!enabled) {
    return {
      items: [],
      health: [normalizeHealth("email", configPath, { ok: true, skipped: true })],
    };
  }

  let config;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = JSON.parse(raw);
  } catch (e) {
    return {
      items: [],
      health: [normalizeHealth("email", configPath, { ok: false, itemCount: 0, error: String(e?.message ?? e) })],
    };
  }

  if (!config.enabled) {
    return {
      items: [],
      health: [normalizeHealth("email", configPath, { ok: true, skipped: true, reason: "config.enabled=false" })],
    };
  }

  // Get IMAP credentials from config or environment
  const imapConfig = {
    host: config.imap?.host || process.env.IMAP_HOST,
    port: config.imap?.port || process.env.IMAP_PORT || 993,
    secure: config.imap?.secure !== false,
    user: config.imap?.user || process.env.IMAP_USER,
    password: config.imap?.password || process.env.IMAP_PASSWORD,
    folder: config.imap?.folder || "INBOX",
    maxAge: config.maxAge || 7,
    senders: config.senders || [],
  };

  if (!imapConfig.host || !imapConfig.user || !imapConfig.password) {
    return {
      items: [],
      health: [normalizeHealth("email", configPath, { 
        ok: false, 
        itemCount: 0, 
        error: "Missing IMAP credentials. Set in config or env vars (IMAP_HOST, IMAP_USER, IMAP_PASSWORD)" 
      })],
    };
  }

  try {
    const items = await fetchNewslettersFromImap(imapConfig);
    return {
      items,
      health: [normalizeHealth("email", configPath, { ok: true, itemCount: items.length })],
    };
  } catch (e) {
    return {
      items: [],
      health: [normalizeHealth("email", configPath, { ok: false, itemCount: 0, error: String(e?.message ?? e) })],
    };
  }
}
