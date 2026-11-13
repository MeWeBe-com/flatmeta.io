-- M7 (Mobile + SEO QA): one spelling per sector ("tech" and "Technology" were both shown on /brands).
-- Same table as apps/api/src/lib/sector.ts; new rows are normalised when written.
UPDATE plots SET showcase = jsonb_set(showcase, '{sector}', to_jsonb(CASE lower(btrim(showcase->>'sector'))
    WHEN 'tech' THEN 'Technology'
    WHEN 'technology' THEN 'Technology'
    WHEN 'software' THEN 'Technology'
    WHEN 'food' THEN 'Food & drink'
    WHEN 'drink' THEN 'Food & drink'
    WHEN 'food & drink' THEN 'Food & drink'
    WHEN 'food and drink' THEN 'Food & drink'
    WHEN 'auto' THEN 'Automotive'
    WHEN 'automotive' THEN 'Automotive'
    WHEN 'travel' THEN 'Travel'
    WHEN 'tourism' THEN 'Travel'
    WHEN 'finance' THEN 'Finance'
    WHEN 'retail' THEN 'Retail'
    WHEN 'fashion' THEN 'Retail'
    WHEN 'media' THEN 'Media'
    WHEN 'entertainment' THEN 'Media'
    WHEN 'culture' THEN 'Culture'
    WHEN 'education' THEN 'Education'
    WHEN 'sport' THEN 'Sport'
    WHEN 'sports' THEN 'Sport'
    WHEN 'nonprofit' THEN 'Nonprofit'
    WHEN 'non-profit' THEN 'Nonprofit'
    WHEN 'energy' THEN 'Energy'
    WHEN 'health' THEN 'Health'
    WHEN 'healthcare' THEN 'Health'
    WHEN 'logistics' THEN 'Logistics'
    WHEN 'industry' THEN 'Industry'
    WHEN 'business' THEN 'Business'
    ELSE upper(left(btrim(showcase->>'sector'), 1)) || lower(substr(btrim(showcase->>'sector'), 2))
  END))
WHERE showcase ? 'sector' AND coalesce(btrim(showcase->>'sector'), '') <> '';
