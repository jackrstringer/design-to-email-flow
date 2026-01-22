import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DetectedLink {
  id: string;
  text: string;
  category: "navigation" | "button" | "social" | "email_action";
  searchedUrl: string;
  verified: boolean;
  needsManualUrl: boolean;
  placeholder?: string;
}

interface ClickableElement {
  id: string;
  text: string;
  category: "navigation" | "button" | "social" | "email_action";
  likely_destination: string;
}

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "pinterest.com",
  "youtube.com",
  "linkedin.com",
  "threads.net",
  "snapchat.com",
];

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const trackingParams = [
      "srsltid",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
      "ref",
      "ref_",
    ];
    trackingParams.forEach((p) => parsed.searchParams.delete(p));
    return parsed.toString();
  } catch {
    return url;
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeLinkText(text: string): string {
  // 1) remove marketing suffix after " - "
  let t = text.trim();
  t = t.replace(/\s+-\s+.*$/g, "");
  // 2) remove percentages / numbers
  t = t.replace(/[0-9]+%?/g, " ");
  // 3) remove common CTA filler words
  t = t
    .toLowerCase()
    .replace(/\b(up|to|off|save|now|here|click|learn|more)\b/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isHomepage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === "/" || u.pathname === "";
  } catch {
    return false;
  }
}

function shouldRejectHomepage(linkText: string): boolean {
  const t = linkText.toLowerCase();
  return [
    "deal",
    "sale",
    "weekly",
    "collection",
    "shop",
    "product",
    "fit",
    "testimonial",
    "about",
    "contact",
  ].some((k) => t.includes(k));
}

async function verifyUrl(url: string, allowedHostnames: string[]): Promise<boolean> {
  if (url.startsWith("{{") || url.startsWith("mailto:")) return true;

  const clean = cleanUrl(url);
  const host = hostnameOf(clean);
  const allowSoft = allowedHostnames.includes(host);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; LinkChecker/1.0)",
  };

  try {
    // Try HEAD first (fast), but many sites block it.
    const head = await fetch(clean, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers,
    });

    if (head.status >= 200 && head.status < 400) {
      clearTimeout(timeoutId);
      return true;
    }

    // Soft-accept if site blocks bots (403/405) but hostname is trusted.
    if (allowSoft && (head.status === 403 || head.status === 405)) {
      clearTimeout(timeoutId);
      console.log(`⚠️ Soft-accepting (HEAD ${head.status}) for trusted host: ${clean}`);
      return true;
    }

    // Fallback to a lightweight GET.
    const get = await fetch(clean, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...headers,
        Range: "bytes=0-2048",
      },
    });

    clearTimeout(timeoutId);

    if (get.status >= 200 && get.status < 400) return true;

    if (allowSoft && (get.status === 403 || get.status === 401)) {
      console.log(`⚠️ Soft-accepting (GET ${get.status}) for trusted host: ${clean}`);
      return true;
    }

    return false;
  } catch (e) {
    clearTimeout(timeoutId);
    console.log(`URL verification failed for ${clean}:`, e);
    // If we can't reach it but it's a trusted host, don't block progress.
    if (allowSoft) {
      console.log(`⚠️ Soft-accepting (network error) for trusted host: ${clean}`);
      return true;
    }
    return false;
  }
}

async function firecrawlMap(brandDomain: string): Promise<string[]> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) return [];

  const url = `https://${brandDomain}`;

  try {
    console.log(`🗺️ Firecrawl map: ${url}`);

    const resp = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        limit: 5000,
        includeSubdomains: false,
      }),
    });

    if (!resp.ok) {
      console.log(`Firecrawl map failed: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const links = data.links || data.data?.links || [];

    if (!Array.isArray(links)) return [];

    const cleaned = links
      .filter((l: any) => typeof l === "string")
      .map((l: string) => cleanUrl(l));

    console.log(`🗺️ Map returned ${cleaned.length} urls`);
    return cleaned;
  } catch (e) {
    console.log("Firecrawl map error:", e);
    return [];
  }
}

function bestInternalUrlFromMap(mapUrls: string[], brandDomain: string, linkText: string): string | null {
  const base = normalizeLinkText(linkText);
  if (!base) return null;

  const slug = toSlug(base);
  const compactSlug = slug.replace(/-/g, "");
  const tokens = slug.split("-").filter((t) => t.length > 1);

  let best: { url: string; score: number } | null = null;

  for (const url of mapUrls) {
    const host = hostnameOf(url);
    if (host !== brandDomain) continue;

    if (isHomepage(url) && shouldRejectHomepage(linkText)) continue;

    let score = 0;

    const path = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return "";
      }
    })();

    if (!path || path === "/") continue;

    if (slug && path.includes(slug)) score += 12;
    if (compactSlug && path.replace(/\//g, "").includes(compactSlug)) score += 8;

    for (const tok of tokens) {
      if (path.includes(tok)) score += 1;
    }

    // Evergreen pages get bonus, product pages are PENALIZED (they're ephemeral)
    if (path.startsWith("/pages/") || path.startsWith("/policies/")) {
      score += 5; // Strong preference for utility pages
    } else if (path.startsWith("/collections/")) {
      score += 3; // Good for category links
    } else if (path.startsWith("/products/")) {
      score -= 15; // HEAVILY penalize product pages - they're ephemeral and shouldn't be in footers
      continue; // Skip product URLs entirely for footer navigation
    }

    if (!best || score > best.score) best = { url, score };
  }

  // Require a strong signal (slug match = 12 points) to prevent garbage matches
  if (best && best.score >= 10) return best.url;
  return null;
}

function bestSocialUrlFromMap(mapUrls: string[], socialDomain: string): string | null {
  for (const url of mapUrls) {
    const host = hostnameOf(url);
    if (host === socialDomain.replace(/^www\./, "") && url.includes(socialDomain)) {
      return url;
    }
    if (url.includes(socialDomain)) {
      return url;
    }
  }
  return null;
}

async function webSearchMissingLinks(
  missing: DetectedLink[],
  brandName: string,
  brandDomain: string,
  ANTHROPIC_API_KEY: string,
): Promise<Record<string, string>> {
  if (missing.length === 0) return {};

  console.log(`🌐 Web-searching ${missing.length} missing links with Anthropic tools...`);

  const list = missing
    .map((l, i) => `${i + 1}. id=${l.id} | text="${l.text}" | category=${l.category}`)
    .join("\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Find EVERGREEN URLs for these email footer navigation links for "${brandName}" (${brandDomain}).

CRITICAL CONTEXT:
These links will be embedded in marketing emails sent to thousands of subscribers.
The emails will be sent over weeks/months, so links MUST be EVERGREEN (stable over time).

✅ GOOD (evergreen):
- /collections/new, /collections/sale, /collections/best-sellers → category pages
- /pages/about, /pages/contact, /pages/faq → utility pages  
- /policies/privacy, /policies/shipping → legal pages
- Social profile URLs (instagram.com/brand, etc.)

❌ BAD (ephemeral - NEVER USE):
- /products/specific-item-name → products come and go, links will break
- /blogs/specific-post → blog posts are dated content
- URLs with dates, campaign IDs, or SKUs

Links to find:
${list}

Rules:
- For "NEW" or "New Arrivals" → /collections/new or /collections/new-arrivals
- For "SALE" → /collections/sale or /pages/sale
- For generic "SHOP" → /collections/all or homepage
- For social links → full profile URL on the platform

Return ONLY JSON:
{
  "results": [
    { "id": "...", "url": "https://..." }
  ]
}

If you can't find a confident EVERGREEN URL, return url as "" (we'll ask the user manually).`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.log("Anthropic web_search error:", resp.status, t);
    return {};
  }

  const data = await resp.json();
  let text = "";
  for (const block of data.content || []) {
    if (block.type === "text") text = block.text;
  }

  const out: Record<string, string> = {};
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return {};

    const parsed = JSON.parse(m[0]);
    for (const r of parsed.results || []) {
      if (r?.id && typeof r.url === "string") {
        out[r.id] = cleanUrl(r.url);
      }
    }
  } catch (e) {
    console.log("Failed to parse web_search JSON:", e);
    console.log("Raw text:", text);
  }

  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { clickableElements, brandDomain, brandName } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    if (!clickableElements || clickableElements.length === 0) {
      return new Response(JSON.stringify({ success: true, links: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Detecting links for elements:", clickableElements);
    console.log("Brand:", brandName, "Domain:", brandDomain);

    const elementsDescription = (clickableElements as ClickableElement[])
      .map(
        (el: ClickableElement, i: number) =>
          `${i + 1}. id=${el.id} | text="${el.text}" | category=${el.category} | likely=${el.likely_destination}`,
      )
      .join("\n");

    const prompt = `You are finding URLs for navigation links in an email footer for "${brandName}" (https://${brandDomain}).

**CRITICAL: USE WEB SEARCH**
You MUST use web_search to visit https://${brandDomain} and find the actual URLs.
DO NOT guess URLs from your training data - the website structure may have changed.

STEP-BY-STEP PROCESS:
1. First, search for "${brandName} official website" or visit https://${brandDomain} directly
2. Look at the website's main navigation and footer to find the actual link URLs
3. For each element below, find the REAL URL as it exists on the website TODAY

IMPORTANT CONTEXT:
These links will be embedded in marketing emails sent to thousands of subscribers.
The emails will be sent for weeks/months, so links MUST be EVERGREEN (stable over time).

Here are the clickable elements detected (keep id AND category EXACTLY as provided):
${elementsDescription}

EVERGREEN URL PATTERNS (prefer these):
- /collections/... → category/collection pages (e.g., /collections/most-wanted, /collections/new)
- /pages/... → static utility pages (e.g., /pages/about, /pages/contact)
- /policies/... → legal pages
- Full social profile URLs (e.g., https://instagram.com/iamloving)

EPHEMERAL PATTERNS (NEVER use):
- /products/... → individual products change frequently
- /blogs/... with specific post names → dated content
- URLs with campaign IDs or dates

EMAIL ACTION PLACEHOLDERS (use exactly as shown):
- Unsubscribe: {{ unsubscribe_url }}
- Manage Preferences: {{ manage_preferences_url }}
- View in Browser: {{ view_in_browser_url }}
- Forward: {{ forward_to_a_friend_url }}

After searching the website, return ONLY a valid JSON array with the ACTUAL URLs you found:
[
  {
    "id": "<exact id from input>",
    "text": "<exact text from input>",
    "category": "<exact category from input>",
    "searchedUrl": "https://... (the REAL URL you found via web search)",
    "verified": false,
    "needsManualUrl": false,
    "placeholder": null
  }
]`;

    console.log("🔍 Calling Claude Sonnet 4 with web_search for accurate link detection...");
    
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 10000,
        },
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 15,
          },
        ],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("Claude API error:", aiResp.status, t);
      throw new Error(`Claude API error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    
    // Collect text from all content blocks (web search + thinking returns multiple blocks)
    let responseText = "";
    for (const block of aiData.content || []) {
      if (block.type === "text") {
        responseText += block.text;
      }
    }
    
    console.log("📝 Claude response length:", responseText.length, "characters");

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in response:", responseText.substring(0, 500));
      throw new Error("Failed to extract JSON from AI response");
    }

    let links: DetectedLink[] = JSON.parse(jsonMatch[0]);

    console.log("AI generated links:", JSON.stringify(links, null, 2));

    // Firecrawl map once (avoids rate limits from per-link searching)
    const mappedUrls = await firecrawlMap(brandDomain);

    const trustedHosts = [
      brandDomain,
      ...SOCIAL_DOMAINS.map((d) => d.replace(/^www\./, "")),
    ];

    // First pass: verify Claude's guesses FIRST, then fall back to sitemap
    const enhanced: DetectedLink[] = [];
    for (const link of links) {
      // placeholders/mailto - always trust these
      if (link.searchedUrl?.startsWith("{{") || link.searchedUrl?.startsWith("mailto:")) {
        link.verified = true;
        link.needsManualUrl = false;
        enhanced.push(link);
        continue;
      }

      const isSocial = link.category === "social";

      // PRIORITY 1: Trust Claude's guess if it's a valid evergreen URL
      // Claude uses intelligent reasoning about URL structures - don't overwrite with fuzzy sitemap matching
      if (link.searchedUrl && !isSocial) {
        const guess = cleanUrl(link.searchedUrl);
        
        // Accept if it's not a homepage (for contextual links) and not a product page (ephemeral)
        const isEvergreenPath = !isHomepage(guess) && !guess.includes('/products/') && !guess.includes('/blogs/');
        
        if (isEvergreenPath || !shouldRejectHomepage(link.text)) {
          const ok = await verifyUrl(guess, trustedHosts);
          if (ok) {
            console.log(`✅ Trusting Claude's guess for "${link.text}": ${guess}`);
            link.searchedUrl = guess;
            link.verified = true;
            link.needsManualUrl = false;
            enhanced.push(link);
            continue;
          }
        }
      }

      // PRIORITY 2: For social links, try to find from sitemap
      if (isSocial && mappedUrls.length > 0) {
        for (const sd of SOCIAL_DOMAINS) {
          const u = bestSocialUrlFromMap(mappedUrls, sd);
          if (u) {
            const ok = await verifyUrl(u, trustedHosts);
            if (ok) {
              link.searchedUrl = u;
              link.verified = true;
              link.needsManualUrl = false;
              enhanced.push(link);
              break;
            }
          }
        }
        if (link.verified) continue;
      }

      // PRIORITY 3: Only use sitemap matching if Claude's guess failed verification
      // This is a fallback, not the primary source
      if (mappedUrls.length > 0 && !isSocial) {
        const normalizedText = normalizeLinkText(link.text);
        const candidate = bestInternalUrlFromMap(mappedUrls, brandDomain, normalizedText || link.text);
        
        if (candidate) {
          const ok = await verifyUrl(candidate, trustedHosts);
          if (ok) {
            console.log(`⚠️ Using sitemap fallback for "${link.text}": ${candidate}`);
            link.searchedUrl = candidate;
            link.verified = true;
            link.needsManualUrl = false;
            enhanced.push(link);
            continue;
          }
        }
      }

      // No valid URL found - mark for manual entry
      link.searchedUrl = "";
      link.verified = false;
      link.needsManualUrl = true;
      enhanced.push(link);
    }

    // Second pass: web search only the ones still missing
    const missing = enhanced.filter(
      (l) =>
        l.needsManualUrl &&
        l.category !== "email_action" &&
        typeof l.text === "string" &&
        l.text.trim().length > 0,
    );

    if (missing.length > 0) {
      const found = await webSearchMissingLinks(missing, brandName, brandDomain, ANTHROPIC_API_KEY);

      for (const link of enhanced) {
        const url = found[link.id];
        if (!url) continue;

        const cleaned = cleanUrl(url);
        const host = hostnameOf(cleaned);
        const isTrusted = host === brandDomain || SOCIAL_DOMAINS.includes(host);
        if (!isTrusted) continue;

        if (isHomepage(cleaned) && shouldRejectHomepage(link.text)) continue;

        const ok = await verifyUrl(cleaned, trustedHosts);
        if (ok) {
          link.searchedUrl = cleaned;
          link.verified = true;
          link.needsManualUrl = false;
        }
      }
    }

    console.log("Final verified links:", JSON.stringify(enhanced, null, 2));

    return new Response(JSON.stringify({ success: true, links: enhanced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Detect footer links error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
