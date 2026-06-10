// Klaviyo API helpers. One revision constant for every call — the old code
// drifted (templates on 2025-01-15, campaigns on 2025-10-15), which meant the
// two halves of a push could disagree about API semantics.

export const KLAVIYO_REVISION = '2025-10-15';
const BASE = 'https://a.klaviyo.com/api';

export interface KlaviyoError {
  status: number;
  detail: string;
}

async function klaviyoFetch(
  apiKey: string,
  path: string,
  init: RequestInit & { maxRetries?: number } = {},
): Promise<Response> {
  const { maxRetries = 3, ...rest } = init;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${BASE}${path}`, {
        ...rest,
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json',
          revision: KLAVIYO_REVISION,
          ...(rest.headers ?? {}),
        },
      });
      // Retry transient gateway errors and rate limits.
      if ((response.status === 429 || (response.status >= 502 && response.status <= 504)) && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get('Retry-After')) || attempt;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
  throw lastError ?? new Error('Klaviyo request failed after retries');
}

export function parseKlaviyoError(status: number, bodyText: string, fallback: string): KlaviyoError {
  try {
    const parsed = JSON.parse(bodyText);
    return { status, detail: parsed.errors?.[0]?.detail || fallback };
  } catch {
    return { status, detail: bodyText || fallback };
  }
}

/** Creates a template. Returns the new template id. */
export async function createTemplate(
  apiKey: string,
  name: string,
  html: string,
): Promise<{ templateId?: string; error?: KlaviyoError }> {
  const response = await klaviyoFetch(apiKey, '/templates', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'template',
        attributes: { name, editor_type: 'USER_DRAGGABLE', html },
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return { error: parseKlaviyoError(response.status, text, 'Failed to create Klaviyo template') };
  }
  return { templateId: JSON.parse(text).data?.id };
}

/**
 * Updates an existing template in place. Fixes the old behavior where every
 * re-push created a brand-new template and any campaign bound to the previous
 * one silently kept stale content.
 */
export async function updateTemplate(
  apiKey: string,
  templateId: string,
  name: string,
  html: string,
): Promise<{ templateId?: string; error?: KlaviyoError }> {
  const response = await klaviyoFetch(apiKey, `/templates/${templateId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'template',
        id: templateId,
        attributes: { name, html },
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return { error: parseKlaviyoError(response.status, text, 'Failed to update Klaviyo template') };
  }
  return { templateId: JSON.parse(text).data?.id ?? templateId };
}

export async function createCampaign(
  apiKey: string,
  params: {
    name: string;
    included: string[];
    excluded: string[];
    subject: string;
    previewText: string;
  },
): Promise<{ campaignId?: string; campaignMessageId?: string; error?: KlaviyoError }> {
  const response = await klaviyoFetch(apiKey, '/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'campaign',
        attributes: {
          name: params.name,
          audiences: { included: params.included, excluded: params.excluded },
          send_strategy: { method: 'immediate' },
          send_options: { use_smart_sending: true },
          'campaign-messages': {
            data: [
              {
                type: 'campaign-message',
                attributes: {
                  definition: {
                    channel: 'email',
                    label: params.name,
                    content: {
                      subject: params.subject,
                      preview_text: params.previewText,
                    },
                  },
                },
              },
            ],
          },
        },
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    return { error: parseKlaviyoError(response.status, text, 'Failed to create Klaviyo campaign') };
  }
  const data = JSON.parse(text);
  return {
    campaignId: data.data?.id,
    campaignMessageId: data.data?.relationships?.['campaign-messages']?.data?.[0]?.id,
  };
}

export async function assignTemplateToMessage(
  apiKey: string,
  campaignMessageId: string,
  templateId: string,
): Promise<{ error?: KlaviyoError }> {
  const response = await klaviyoFetch(apiKey, '/campaign-message-assign-template', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'campaign-message',
        id: campaignMessageId,
        relationships: {
          template: { data: { type: 'template', id: templateId } },
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    return { error: parseKlaviyoError(response.status, text, 'Failed to assign template to campaign') };
  }
  return {};
}

/**
 * Mirrors an externally hosted image (ImageKit/Cloudinary) into Klaviyo's
 * image library so sent emails don't break if the CDN URL ever changes.
 * Returns the Klaviyo-hosted URL, or null on failure (caller falls back to
 * the original URL).
 */
export async function mirrorImageToKlaviyo(
  apiKey: string,
  imageUrl: string,
  name: string,
): Promise<string | null> {
  try {
    const response = await klaviyoFetch(apiKey, '/images', {
      method: 'POST',
      maxRetries: 2,
      body: JSON.stringify({
        data: {
          type: 'image',
          attributes: { import_from_url: imageUrl, name, hidden: false },
        },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.attributes?.image_url ?? null;
  } catch {
    return null;
  }
}
