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
    const { imageUrl, templateName, klaviyoApiKey, footerHtml, mode = 'template', listId } = await req.json();

    if (!imageUrl || !templateName || !klaviyoApiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: imageUrl, templateName, klaviyoApiKey' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating Klaviyo template: ${templateName}`);
    console.log(`Mode: ${mode}, Footer included: ${!!footerHtml}`);

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

    // Footer section wrapped in editable region with zero padding
    const footerSection = footerHtml ? `
          <tr>
            <td data-klaviyo-region="true" data-klaviyo-region-width-pixels="600" style="padding: 0;">
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
    console.log(`Klaviyo template response status: ${response.status}`);

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

    const templateData = JSON.parse(responseText);
    const templateId = templateData.data?.id;
    console.log(`Template created successfully: ${templateId}`);

    // If mode is 'template', return just the template
    if (mode === 'template') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          templateId,
          message: 'Template created successfully'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode is 'campaign' - create campaign and assign template
    if (!listId) {
      return new Response(
        JSON.stringify({ error: 'listId is required for campaign mode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating campaign with list: ${listId}`);

    // Create campaign using new API with immediate method (creates draft)
    const campaignResponse = await fetch('https://a.klaviyo.com/api/campaigns', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/vnd.api+json',
        'accept': 'application/vnd.api+json',
        'revision': '2025-10-15'
      },
      body: JSON.stringify({
        data: {
          type: 'campaign',
          attributes: {
            name: templateName,
            audiences: {
              included: [listId],
              excluded: []
            },
            send_strategy: {
              method: 'immediate'
            },
            send_options: {
              use_smart_sending: true
            }
          }
        }
      })
    });

    const campaignResponseText = await campaignResponse.text();
    console.log(`Klaviyo campaign response status: ${campaignResponse.status}`);
    if (!campaignResponse.ok) {
      console.log(`Campaign creation error response: ${campaignResponseText}`);
    }

    if (!campaignResponse.ok) {
      let errorMessage = 'Failed to create Klaviyo campaign';
      try {
        const errorData = JSON.parse(campaignResponseText);
        errorMessage = errorData.errors?.[0]?.detail || errorMessage;
      } catch {
        errorMessage = campaignResponseText || errorMessage;
      }

      // Still return template ID so user can use it
      return new Response(
        JSON.stringify({
          success: true,
          templateId,
          error: `Template created but campaign failed: ${errorMessage}`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const campaignData = JSON.parse(campaignResponseText);
    const campaignId = campaignData.data?.id;
    console.log(`Campaign created: ${campaignId}`);

    // Get the campaign message ID from relationships
    const campaignMessageId = campaignData.data?.relationships?.['campaign-messages']?.data?.[0]?.id;
    console.log(`Campaign message ID: ${campaignMessageId}`);

    if (!campaignMessageId) {
      return new Response(
        JSON.stringify({
          success: true,
          templateId,
          campaignId,
          error: 'Campaign created but could not get message ID to assign template',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Assign template to campaign message
    const assignResponse = await fetch(`https://a.klaviyo.com/api/campaign-messages/${campaignMessageId}/relationships/template`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/vnd.api+json',
        'accept': 'application/vnd.api+json',
        'revision': '2025-10-15'
      },
      body: JSON.stringify({
        data: {
          type: 'template',
          id: templateId
        }
      })
    });

    const assignResponseText = await assignResponse.text();
    console.log(`Assign template response status: ${assignResponse.status}`);
    if (!assignResponse.ok) {
      console.log(`Assign template error: ${assignResponseText}`);
      return new Response(
        JSON.stringify({
          success: true,
          templateId,
          campaignId,
          error: `Campaign created but template assignment failed`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update campaign message with from/subject
    const updateMessageResponse = await fetch(`https://a.klaviyo.com/api/campaign-messages/${campaignMessageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
        'Content-Type': 'application/vnd.api+json',
        'accept': 'application/vnd.api+json',
        'revision': '2025-10-15'
      },
      body: JSON.stringify({
        data: {
          type: 'campaign-message',
          id: campaignMessageId,
          attributes: {
            label: templateName,
            content: {
              subject: 'Hi there',
              from_email: 'jack@redwood.so',
              from_label: 'Jack Stringer'
            }
          }
        }
      })
    });

    const updateResponseText = await updateMessageResponse.text();
    console.log(`Update message response status: ${updateMessageResponse.status}`);
    if (!updateMessageResponse.ok) {
      console.log(`Update message error: ${updateResponseText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        templateId,
        campaignId,
        message: 'Campaign created successfully with template',
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
