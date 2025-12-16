import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, templateName, klaviyoApiKey, footerHtml } = await req.json();

    if (!imageUrl || !templateName || !klaviyoApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: imageUrl, templateName, klaviyoApiKey' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating Klaviyo template: ${templateName}`);
    console.log(`Footer included: ${!!footerHtml}`);

    // Dark mode CSS for footer
    const darkModeCss = footerHtml ? `
  <style type="text/css">
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    @media (prefers-color-scheme: dark) {
      .darkmode { background-color: #111111 !important; }
      .darkmode-text { color: #ffffff !important; }
    }
  </style>` : '';

    // Footer section wrapped in editable region
    const footerSection = footerHtml ? `
          <tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <div class="klaviyo-block klaviyo-text-block">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  ${footerHtml}
                </table>
              </div>
            </td>
          </tr>` : '';

    // Build the hybrid HTML template with Klaviyo editable region
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${templateName}</title>${darkModeCss}
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
          <tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600">
              <div class="klaviyo-block klaviyo-image-block">
                <img src="${imageUrl}" width="600" style="display: block; width: 100%; height: auto;" alt="${templateName}" />
              </div>
            </td>
          </tr>${footerSection}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Call Klaviyo API to create the template
    const response = await fetch('https://a.klaviyo.com/api/templates', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/json',
        'revision': '2025-01-15'
      },
      body: JSON.stringify({
        data: {
          type: 'template',
          attributes: {
            name: templateName,
            editor_type: 'USER_DRAGGABLE',
            html: html
          }
        }
      })
    });

    const responseText = await response.text();
    console.log(`Klaviyo response status: ${response.status}`);
    console.log(`Klaviyo response: ${responseText}`);

    if (!response.ok) {
      let errorMessage = 'Failed to create Klaviyo template';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.errors?.[0]?.detail || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = JSON.parse(responseText);
    const templateId = data.data?.id;

    console.log(`Template created successfully: ${templateId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        templateId,
        message: 'Template created successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in push-to-klaviyo:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
