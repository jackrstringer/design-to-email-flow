UPDATE public.brand_footers
SET html = replace(replace(html, 'unsubscribe_url', 'unsubscribe_link'), 'manage_preferences_url', 'manage_preferences_link'),
    updated_at = now()
WHERE html LIKE '%unsubscribe_url%' OR html LIKE '%manage_preferences_url%';

UPDATE public.brands
SET footer_html = replace(replace(footer_html, 'unsubscribe_url', 'unsubscribe_link'), 'manage_preferences_url', 'manage_preferences_link'),
    updated_at = now()
WHERE footer_html LIKE '%unsubscribe_url%' OR footer_html LIKE '%manage_preferences_url%';

UPDATE public.footer_editor_sessions
SET current_html = replace(replace(current_html, 'unsubscribe_url', 'unsubscribe_link'), 'manage_preferences_url', 'manage_preferences_link'),
    updated_at = now()
WHERE current_html LIKE '%unsubscribe_url%' OR current_html LIKE '%manage_preferences_url%';