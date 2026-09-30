TwiggyTomato — Product & Technical Specification
Sep 30, 2026 · @Abhishek
1. Overview
TwiggyTomato v1 is a restaurant discovery app: a diner enters a location, browses nearby restaurants and cafes, and gets everything needed to decide where to eat. Restaurants manage their own listings through a partner portal. Ordering, delivery and payments come later; v1 is built so they can be added without re-architecture.
Launch region: Neem Ka Thana, Rajasthan, and nearby towns (for example Patan, Khetri, Shrimadhopur and Kotputli; the exact list is set after the first field survey). The local mix is dhabas, sweet shops, bhojanalayas, street food, bakeries, cafes and family restaurants, so the app launches in Hindi and English and a field team seeds the listings.
Goals for v1
• A diner goes from opening the app to a confident restaurant choice in under 2 minutes.
• Every listing answers the core decision questions: what food, how much, how good, how far, open now, what vibe.
• Restaurants can self-onboard and keep menus, hours, photos and offers current without calling support.
• Data stays trustworthy: verified listings, moderated reviews, fresh hours.
Personas
Persona
Who
What they need
Diner
Anyone choosing where to eat, alone or in a group
Fast discovery, honest reviews, prices, distance, open-now status
Restaurant owner / manager
Runs one or several outlets
Easy listing management, visibility, reviews, insights
Restaurant staff
Front-of-house or marketing staff
Limited access: update menu, photos, reply to reviews
Platform admin
TwiggyTomato ops team
Verify restaurants, moderate content, manage cities and cuisines
Surfaces
1. Diner app — mobile (iOS, Android) and responsive web.
2. Partner portal — web app for restaurants (desktop-first, mobile-friendly).
3. Field data collection app — offline-first mobile app for the field team that seeds listings.
4. Admin console — internal web app.
5. Backend API + database — shared by all four.
Out of scope for v1
• Food ordering, delivery, payments and table-booking transactions (v1 shows a "Book / Call" link only).
• Loyalty programmes and wallets.
• Social feed and following other users.
2. Diner app: location and discovery
The home screen is a location-scoped feed: set a location once, then everything is sorted by relevance and distance from it.
2.1 Setting the location
• Auto-detect via GPS on first launch, with a clear permission prompt and a fallback if denied.
• Search an address with autocomplete (Google Places or Mapbox): locality, landmark, pincode or full address.
• Pick on map by dragging a pin, for areas where addresses are unreliable.
• Saved locations: Home, Work, Other, for signed-in users.
• The current location shows in the header; tapping it reopens the picker.
• If the location is outside a live city, show "We're not here yet" with an option to be notified.
2.2 Home feed layout (top to bottom)
1. Header: location, search bar, profile.
2. Quick filter chips (Open now, Rating 4+, Pure veg, Offers, Under ₹500 for two, Near me).
3. Cuisine / category carousel (Pizza, Biryani, Cafes, Desserts, Chinese…) with icons.
4. Curated collections ("Trending this week", "Rooftop dining", "Great breakfasts", "New openings").
5. "Restaurants near you" — infinite list of restaurant cards, with sort and full filters.
6. Toggle between List and Map view; map shows pins with rating badges.
2.3 Restaurant card: key highlights
Each card must answer "is this worth tapping?" at a glance.
Element
Example
Notes
Cover photo (carousel of up to 3)
Dish or ambience shot
Lazy-loaded, blur placeholder
Name
The Bombay Canteen

Rating + count
4.4 ★ (2.1k reviews)
Colour-coded: green ≥ 4, amber 3–4, red < 3
Cuisines
North Indian, Mughlai, Biryani
Max 3, then "+2"
Cost for two
₹800 for two
Also a price band ₹–₹₹₹₹
Distance
1.2 km
From the chosen location
Open status
Open now · Closes 11 pm / Opens at 7 pm
Computed from hours, timezone aware
Locality
Bandra West

Offer badge
20% off on weekdays
If an active offer exists
Tags
Pure veg, Outdoor seating, Pet friendly
Max 2 most relevant
Save (heart)

Adds to user's saved list
Cards for sponsored listings carry a visible "Promoted" label. Sponsored placement is built for launch but stays switched off by an admin feature flag until traffic justifies selling it.
3. Search, filters and sorting
One search box covers restaurants, cuisines and dishes; filters narrow any result set and combine with AND across groups, OR within a group.
3.1 Search
• Type-ahead after 2 characters, grouped results: Restaurants, Cuisines, Dishes ("butter chicken" returns restaurants serving it).
• Typo tolerance and synonyms ("biriyani" → biryani, "cafe" → café).
• Recent searches and trending searches when the box is empty.
• Results respect the current location and active filters.
3.2 Filters
Group
Options
Type
Availability
Open now, Open late (after 11 pm), Open 24 hours
Toggle
Rating
3.5+, 4.0+, 4.5+
Single select
Cost for two
Under ₹300, ₹300–600, ₹600–1,200, ₹1,200+ (or range slider)
Range
Distance
Within 1, 3, 5, 10 km
Single select
Cuisine
Searchable list of all cuisines
Multi select
Establishment type
Casual dining, Fine dining, Café, QSR, Bakery, Dessert parlour, Bar/pub, Food court, Cloud kitchen, Food truck, Dhaba, Sweet shop (mithai), Bhojanalaya, Street food stall
Multi select
Dietary
Pure veg, Vegan options, Jain food, Gluten-free options, Halal, Eggless
Multi select
Meal / occasion
Breakfast, Lunch, Dinner, Late night, Brunch, Date night, Family, Work-friendly
Multi select
Features
Outdoor seating, Rooftop, Live music, Serves alcohol, Wi-Fi, Pet friendly, Kid friendly, Wheelchair accessible, Parking, Air-conditioned, Smoking area, Private dining
Multi select
Services
Dine-in, Takeaway, Delivery (external link), Table reservation
Multi select
Payment
Cards, UPI, Cash only
Multi select
Offers
Has active offers
Toggle
New
Opened in the last 90 days
Toggle
• Popular filters appear as chips on the feed; the full set opens in a bottom sheet with a live result count ("Show 142 places").
• Active filters show as removable chips above results, with "Clear all".
• Filters persist for the session and reset on location change only if they no longer make sense (distance).
3.3 Sort
• Relevance (default): blend of rating, review volume, distance, open status, freshness and engagement.
• Distance: nearest first.
• Rating: highest first, with a minimum review count to avoid 5.0 ★ from 2 reviews.
• Cost: low to high, high to low.
• Popularity: most viewed and saved in the last 30 days.
3.4 Collections and saving
• Editorial collections curated by admins per city ("Best biryani in Hyderabad").
• Auto collections from data ("Top rated near you", "New and trending").
• Personal lists: users save restaurants to "Want to go", "Favourites" or custom lists, and can share a list link.
4. Restaurant detail page
The detail page answers the decision in the first screen (rating, cost, distance, open now, cuisines) and puts depth in tabs below: Overview, Menu, Photos, Reviews.
4.1 Above the fold
• Photo gallery hero (swipeable, tap for full screen), photo count.
• Name, locality, cuisines, establishment type.
• Rating block: overall rating, review count, and separate dining rating if delivery ratings are added later.
• Cost for two, price band, open status with today's hours.
• Distance and estimated travel time.
• Action bar: Directions, Call, Book a table (external link or phone in v1), Share, Save.
• Active offers strip.
4.2 Overview tab
• Highlights: auto-generated from attributes and reviews, e.g. "Known for: Mutton biryani, Phirni", "Great for: Family dinners", "Must try" dishes.
• About: short description written by the restaurant (max 500 characters).
• Opening hours: full week, multiple shifts per day (12–3 pm, 7–11 pm), holiday closures, "Hours last confirmed on" date.
• Address and map: static map preview, landmark, parking info.
• Amenities and features: icon grid (Wi-Fi, AC, outdoor seating, live music, bar, wheelchair access, pet friendly, parking).
• Dietary: pure veg, vegan and Jain options, allergen notes.
• Payment methods and services (dine-in, takeaway, reservation).
• Average wait time / best time to visit (from partner input in v1; from check-in data later).
• Dress code, age policy, alcohol policy where relevant.
• Safety and hygiene: hygiene certificate (e.g. FSSAI licence number in India), last inspection date if available.
• Similar restaurants nearby carousel.
4.3 Menu tab
• Sections (Starters, Mains, Desserts, Beverages) with sticky section navigation.
• Each item: name, description, price, veg / non-veg / egg marker, spice level, tags (Bestseller, Chef's special, New), optional photo, allergens.
• Variants and add-ons shown as info (Half / Full, Regular / Large).
• Search within menu; veg-only toggle.
• Menu photos (scanned paper menus) as a fallback when no digital menu exists.
• "Menu last updated on" date.
4.4 Photos tab
• Categories: Food, Ambience, Menu, Exterior; from restaurant and from diners.
• Diners can upload photos with a review; photos go through moderation before appearing.
4.5 Reviews tab
• Rating distribution (5 bars), average, total count.
• AI review summary: 3–4 lines on what people love and complain about, regenerated nightly.
• Aspect ratings: Food, Service, Ambience, Value for money.
• Sort: Most relevant, Newest, Highest, Lowest; filter: With photos, Rating value, Keyword.
• Each review: user name, avatar, reviewer level, date, rating, text, photos, dishes tagged, visit type (dine-in, takeaway), helpful count, restaurant reply.
• Actions: Mark helpful, Report.
• Write a review: 1–5 stars (required), aspect ratings, text (min 20 characters), photos (max 10), dishes tried.
4.6 Trust signals
• Verified badge for restaurants that completed document verification.
• "Claimed by owner" status; unclaimed listings show "Own this place? Claim it". Whether unclaimed listings are shown at all is an admin setting (on or off, per city).
• Freshness dates on hours and menu.
• "Report incorrect info" link (closed permanently, wrong hours, wrong phone, other).
5. Restaurant partner portal
Restaurants self-onboard, get verified, and then manage every field a diner sees; changes to core facts (name, address) need admin re-approval, everything else goes live immediately.
5.1 Onboarding and verification
1. Sign up with phone OTP or email; create a partner account.
2. Search for the restaurant: claim an existing listing or create a new one.
3. Fill the basics: name, address (map pin), phone, cuisines, establishment type, cost for two, hours.
4. Upload documents: food-safety licence (FSSAI in India), GST or business registration, proof of ownership or authorisation, one storefront photo.
5. Listing status moves Draft → Pending review → Live (or Rejected with a reason). Admins target review within 48 hours.
5.2 Portal modules
Module
What the restaurant can do
Dashboard
See profile views, search appearances, directions and call clicks, saves, rating trend, new reviews; 7 / 30 / 90-day views
Outlet profile
Edit description, cuisines, type, cost for two, contact, website, social links, attributes and amenities, dietary tags, payment methods, policies
Hours
Weekly schedule with multiple shifts per day; special hours for holidays; temporarily closed toggle ("Closed today", "Closed until…")
Menu manager
Create sections and items; price, veg marker, spice, tags, allergens, photo, variants; drag to reorder; mark items unavailable; bulk import from CSV / Excel; upload menu photos
Photos
Upload, categorise (food, ambience, menu, exterior), set cover photo, reorder; see diner photos and flag inappropriate ones
Reviews
Read all reviews, filter by rating and date, reply publicly (one reply per review, editable), report abusive reviews
Offers
Create offers: title, terms, discount type, valid days and hours, start and end date; pause or end
Team
Invite users by email or phone, assign role: Owner, Manager, Staff
Multi-outlet
Chains switch between outlets or apply a change (menu, offer) to several outlets at once
Settings
Notification preferences, documents on file, account and billing (for future paid promotions)
5.3 Roles and permissions
Action
Owner
Manager
Staff
Edit profile, hours, menu, photos
Yes
Yes
Menu and photos only
Reply to reviews
Yes
Yes
No
Create offers
Yes
Yes
No
Manage team
Yes
No
No
Change name or address (needs approval)
Yes
No
No
View analytics
Yes
Yes
No
5.4 Notifications to partners
• New review (instant for 1–2 ★, daily digest otherwise).
• Listing approved or rejected; info-correction reported by a diner.
• Reminder to confirm hours every 60 days, and to update menu if older than 120 days.
6. Admin console
The admin console keeps listings real and reviews honest; every admin action is written to an audit log.
• Verification queue: approve or reject new listings, claims and name / address changes; view documents side by side.
• Field capture review: approve, edit or send back field-app submissions; see duplicates and GPS accuracy.
• Field operations: create field agents, assign beats and leads, track daily captures per agent and per town.
• Lead import: upload leads sourced from the internet (CSV), de-duplicate them, assign them for verification.
• Moderation queue: reported reviews and photos, auto-flagged content (profanity, spam, suspected fake reviews); actions: keep, hide, delete, warn or ban user.
• Info corrections: diner-reported errors, with one-click apply or dismiss.
• Catalogue: manage cities, localities, cuisines, establishment types, amenities and tags (the filter vocabulary).
• Collections: create editorial collections per city, pick restaurants, schedule publication.
• Users and partners: search, view history, suspend.
• Promotions: mark listings as sponsored for a city and date range; hidden until the sponsored-listings flag is on.
• Settings and feature flags: show unclaimed listings (on or off, global or per city), sponsored listings on or off, review rules, brand settings (app name, logo, colours, support contacts).
• Audit log: who changed what, when, before and after values.
Fake review defences (v1): one review per user per restaurant per 30 days, verified phone required to review, velocity checks (burst of 5-star reviews in a day), device fingerprinting, and admins can bulk-hide reviews from a flagged cluster.
7. Field data collection app
A field team seeds the Neem Ka Thana region because most local eateries have no online presence; they use a dedicated offline-first mobile app, and internet sources only supply leads the team then verifies on the ground.
7.1 Why a field app
• Dhabas, sweet shops, bhojanalayas and street stalls in small towns rarely have websites, digital menus or correct map pins.
• Mobile data is patchy outside town centres, so capture must work offline and sync later.
• Original photos and first-hand details avoid copyright and terms-of-service problems with copied data.
7.2 Internet sourcing (leads, not listings)
• Admins import leads from public sources (Google Maps search results, JustDial, social media pages, local directories) as a CSV or through the admin import tool.
• A lead holds only a name, rough location, phone and source link, and is assigned to a field agent to verify.
• Do not copy photos, reviews or menus from Zomato, Swiggy or Google; their terms forbid it. Google Places data may be used only as their licence allows (store the place_id, not the content).
• A lead becomes a listing only after a field visit or a phone verification by admin.
7.3 Field app features
Feature
Detail
Login
Phone OTP; role field_agent or field_supervisor; admin creates the accounts
My area
Map of assigned beat (town, ward or road stretch), leads to visit as pins, already-captured places shown to avoid repeats
New listing
GPS pin auto-captured with accuracy shown (must be under 30 m or agent drags pin); name in English and Hindi; address, landmark, phone, WhatsApp number
Details checklist
Establishment type, cuisines, veg / non-veg, cost for two, opening hours, seating (dine-in, takeaway only), amenities, payment methods (UPI, cash, card)
Photos
Required: storefront. Optional: every menu page, food, interior. Compressed on device, watermark-free, EXIF location kept for QA only
Menu capture
Photograph menu pages; typed digital menu added later by the ops team or OCR
Owner consent
Owner name and phone, "agrees to be listed" checkbox, "interested in managing listing" flag that triggers a partner-portal invite SMS
Duplicate check
Warns when a place with a similar name exists within 50 m
Offline mode
Everything saved on device; syncs automatically when online; shows pending uploads
Visit log
Visit outcome: captured, closed permanently, owner refused, revisit needed (with reminder date)
My progress
Places captured today and this week, approval rate, rejected items with reasons to fix
7.4 Quality flow
1. Agent submits a capture; status Submitted.
2. A supervisor or admin reviews it in the admin console: edits, approves or sends it back with a reason.
3. Approved captures become Live unclaimed listings (source = field) if unclaimed listings are enabled, otherwise Approved, hidden until the owner claims.
4. Owners who said yes to the invite get an SMS link to claim and manage the listing.
The field app is built in the same React Native codebase family as the diner app (a separate app binary), with a local SQLite store for offline work.
8. System architecture and tech stack
Start with one well-structured backend service (a modular monolith) and managed cloud services; split into microservices only when a module's load or team size demands it.
All four apps call one API through a gateway. PostgreSQL is the source of truth; background workers keep the search index, ratings and open-now data in sync and handle slow work off the request path.
8.1 Tech stack
Layer
Choice
Why
Diner and field mobile apps
React Native (Expo) + TypeScript
One codebase for iOS and Android; shares types with backend
Diner web, partner portal, admin
Next.js (React) + TypeScript, Tailwind
SEO-friendly restaurant pages; fast to build dashboards
Maps in app
Google Maps SDK or Mapbox
Map view, pins, directions deep-links
Backend API
Node.js + NestJS (TypeScript), REST + OpenAPI
Typed, modular, large hiring pool
Database
PostgreSQL 16 + PostGIS (AWS RDS / Aurora)
Relational data, geo queries
Search
OpenSearch (or Typesense for a smaller start)
Full-text, typo tolerance, geo sort, faceted filters
Cache and queue
Redis (ElastiCache) + BullMQ
Hot restaurant pages, rate limits, background jobs
Media
S3 + CloudFront, image resizing on upload
Fast photos in multiple sizes
Auth
Own OTP + JWT, or a managed service (Auth0, Cognito)
Phone-first login
Notifications
FCM / APNs push, email via SES, SMS via MSG91 or Twilio
Partner and diner alerts
Analytics
Event pipeline to BigQuery or ClickHouse; product analytics (PostHog / Mixpanel)
Funnels, partner dashboards
Infra
AWS, Docker, ECS Fargate or Kubernetes, Terraform, GitHub Actions CI/CD
Repeatable deployments
Observability
OpenTelemetry, Grafana / Datadog, Sentry
Latency, errors, crash reports
8.2 Key flows
• Search and listing: app sends location + filters → API queries OpenSearch (geo-distance filter, facets, sort) → hydrates cards from Redis cache → returns a page of 20.
• Partner edit: portal PATCHes the restaurant → API writes to PostgreSQL and records an audit entry → queues a re-index job → worker updates OpenSearch within seconds.
• Review submitted: API saves review as published (or pending if auto-flagged) → worker recalculates rating aggregates and notifies the partner.
9. Data model
PostgreSQL with PostGIS is the system of record; all ids are UUIDs, all tables carry created_at and updated_at, and money is stored as integer minor units (paise) with a currency code.
9.1 Core tables
Table
Key columns
Notes
users
id, name, phone (unique), email, avatar_url, role (diner, partner, admin), phone_verified, status, last_login_at
One account can be both diner and partner
user_addresses
id, user_id, label (home, work, other), address_text, location (geography Point), is_default
Saved locations
cities
id, name, state, country, timezone, centre (Point), is_live
Controls where the app operates
localities
id, city_id, name, boundary (Polygon)
For "Bandra West" labels and locality search
restaurants
id, slug, name, description, city_id, locality_id, address_line, landmark, pincode, location (geography Point), phone, website, establishment_type_id, cost_for_two, price_band (1–4), status (draft, pending, live, rejected, suspended, closed_permanently), is_verified, is_claimed, temporarily_closed_until, avg_rating, review_count, rating_breakdown (jsonb), hours_confirmed_at, menu_updated_at
Denormalised rating fields updated by a job
cuisines
id, name, slug, icon_url
Catalogue
restaurant_cuisines
restaurant_id, cuisine_id, is_primary
Many-to-many
establishment_types
id, name, slug
Café, Fine dining, QSR…
attributes
id, key, name, group (feature, dietary, service, payment, occasion), icon
The filter vocabulary
restaurant_attributes
restaurant_id, attribute_id, value (jsonb, optional)
e.g. parking: "valet"
opening_hours
id, restaurant_id, day_of_week (0–6), opens_at, closes_at, shift_no
Closing past midnight allowed (closes_at < opens_at)
special_hours
id, restaurant_id, date, is_closed, opens_at, closes_at, note
Holidays and one-offs
menu_sections
id, restaurant_id, name, sort_order

menu_items
id, section_id, restaurant_id, name, description, price, currency, diet (veg, non_veg, egg, vegan), spice_level (0–3), tags (text[]), allergens (text[]), photo_url, is_available, sort_order

menu_item_variants
id, item_id, name, price
Half / Full, sizes
photos
id, restaurant_id, uploaded_by, source (partner, diner), category (food, ambience, menu, exterior), url, width, height, status (pending, approved, rejected), is_cover, sort_order
Files in object storage
reviews
id, restaurant_id, user_id, rating (1–5), food_rating, service_rating, ambience_rating, value_rating, text, visit_type, visited_on, helpful_count, status (published, hidden, removed), created_at
Unique (user_id, restaurant_id) within 30 days, enforced in service
review_photos
review_id, photo_id

review_dishes
review_id, menu_item_id
Dishes tried
review_replies
id, review_id (unique), partner_user_id, text
One reply per review
review_votes
review_id, user_id, type (helpful)

offers
id, restaurant_id, title, terms, discount_type (percent, flat, bogo, other), value, valid_days (int[]), valid_from_time, valid_to_time, starts_on, ends_on, status

saved_lists
id, user_id, name, is_public, share_slug

saved_list_items
list_id, restaurant_id, added_at

collections
id, city_id, title, description, cover_url, type (editorial, auto), rules (jsonb), starts_on, ends_on, sort_order

collection_restaurants
collection_id, restaurant_id, sort_order

restaurant_members
restaurant_id, user_id, role (owner, manager, staff), invited_by, status
Partner access control
verification_requests
id, restaurant_id, submitted_by, type (new, claim, core_change), payload (jsonb), documents (jsonb), status, reviewer_id, decision_note

reports
id, reporter_id, target_type (review, photo, restaurant), target_id, reason, details, status, resolved_by
Moderation and info corrections
sponsored_placements
id, restaurant_id, city_id, starts_on, ends_on, slot

audit_log
id, actor_id, action, entity_type, entity_id, before (jsonb), after (jsonb), created_at
Append-only
analytics_daily
restaurant_id, date, views, search_impressions, calls, directions, saves, shares
Aggregated from the event stream
9.2 Indexes and rules
• GiST index on restaurants.location for radius queries (ST_DWithin) and distance sort.
• B-tree on restaurants (city_id, status), reviews (restaurant_id, created_at desc), menu_items (restaurant_id).
• Trigram (pg_trgm) index on restaurants.name as a fallback when the search engine is down.
• Soft deletes (deleted_at) on restaurants, reviews and photos so moderation can be reversed.
• "Open now" is computed from opening_hours + special_hours in the city timezone, and pre-computed into the search index every 5 minutes as open_intervals for fast filtering.
9.3 Field collection, settings and branding
Table / column
Key columns
Notes
users.role
adds field_agent, field_supervisor
Field team accounts
restaurants (new columns)
name_hi, source (field, web_lead, partner, admin), source_ref, captured_by, owner_consent, is_visible
is_visible is computed from status, claim state and the unclaimed-listings setting
field_areas
id, city_id, name, boundary (Polygon)
Beats assigned to agents
field_assignments
id, area_id, agent_id, starts_on, ends_on

leads
id, city_id, name, location (Point), phone, source (google_maps, justdial, social, directory, other), source_url, status (new, assigned, verified, rejected, duplicate), assigned_to, restaurant_id
Internet-sourced leads, never shown to diners
field_submissions
id, agent_id, lead_id, restaurant_id, client_uuid, payload (jsonb), gps_accuracy_m, status (submitted, approved, sent_back), reviewer_id, review_note, captured_at, synced_at
client_uuid makes offline sync idempotent
field_visits
id, agent_id, restaurant_id or lead_id, outcome (captured, closed, refused, revisit), revisit_on, note

app_settings
key, value (jsonb), city_id (nullable), updated_by
Feature flags: unclaimed_listings_enabled, sponsored_enabled; global value with per-city override
brand_config
id, app_name, short_name, logo_url, icon_url, primary_colour, support_email, support_phone, web_domain, active
One active row; apps read it at start-up
10. API specification
A versioned REST API (/v1) with JSON bodies, JWT bearer auth, cursor pagination (?cursor=&limit=), and a standard error shape { "error": { "code", "message", "details" } }.
10.1 Auth
Method
Path
Purpose
POST
/v1/auth/otp/request
Send OTP to phone
POST
/v1/auth/otp/verify
Verify OTP; returns access token (15 min) + refresh token (30 days)
POST
/v1/auth/oauth/google, /apple
Social sign-in
POST
/v1/auth/refresh
Rotate tokens
POST
/v1/auth/logout
Revoke refresh token
10.2 Diner (public; auth optional unless noted)
Method
Path
Purpose
GET
/v1/geo/autocomplete?q=
Address suggestions
GET
/v1/geo/reverse?lat=&lng=
Coordinates to address and city; tells if city is live
GET
/v1/home?lat=&lng=
Feed: chips, cuisines, collections, first page of restaurants
GET
/v1/restaurants?lat=&lng=&sort=&filters…
Listing with filters (open_now, rating_min, cost_min, cost_max, radius_km, cuisines[], types[], attributes[], has_offers)
GET
/v1/search?q=&lat=&lng=
Type-ahead: restaurants, cuisines, dishes
GET
/v1/filters?city_id=
Filter vocabulary and counts
GET
/v1/restaurants/{id}
Full detail: profile, hours, attributes, offers, highlights
GET
/v1/restaurants/{id}/menu
Sections, items, variants
GET
/v1/restaurants/{id}/photos?category=
Paginated photos
GET
/v1/restaurants/{id}/reviews?sort=&rating=&with_photos=
Paginated reviews + summary
POST
/v1/restaurants/{id}/reviews
Write review (auth)
POST
/v1/reviews/{id}/helpful
Vote helpful (auth)
POST
/v1/reports
Report review, photo or wrong info (auth)
GET
/v1/collections?city_id= , /v1/collections/{id}
Collections
GET, POST, DELETE
/v1/me/lists, /v1/me/lists/{id}/items
Saved lists (auth)
GET, POST, PATCH
/v1/me, /v1/me/addresses
Profile and saved addresses (auth)
POST
/v1/uploads/sign
Pre-signed URL for photo upload (auth)
POST
/v1/events
Batched analytics events (view, call, directions, share)
10.3 Partner (auth, role-checked per restaurant)
Method
Path
Purpose
GET
/v1/partner/restaurants
Outlets the user can manage
POST
/v1/partner/restaurants
Create listing (draft)
POST
/v1/partner/restaurants/{id}/claim
Claim existing listing
PATCH
/v1/partner/restaurants/{id}
Update profile fields
POST
/v1/partner/restaurants/{id}/submit
Submit for verification
PUT
/v1/partner/restaurants/{id}/hours, /special-hours
Replace schedule
CRUD
/v1/partner/restaurants/{id}/menu/sections, /menu/items
Menu management
POST
/v1/partner/restaurants/{id}/menu/import
CSV / Excel import (async job)
CRUD
/v1/partner/restaurants/{id}/photos
Photo management
GET
/v1/partner/restaurants/{id}/reviews
Reviews inbox
PUT
/v1/partner/reviews/{id}/reply
Reply to review
CRUD
/v1/partner/restaurants/{id}/offers
Offers
CRUD
/v1/partner/restaurants/{id}/members
Team and roles
GET
/v1/partner/restaurants/{id}/analytics?from=&to=
Dashboard metrics
10.4 Admin (auth, admin role)
Method
Path
Purpose
GET, POST
/v1/admin/verifications, /{id}/approve, /{id}/reject
Verification queue
GET, POST
/v1/admin/reports, /{id}/resolve
Moderation queue
CRUD
/v1/admin/cities, /cuisines, /attributes, /establishment-types
Catalogue
CRUD
/v1/admin/collections, /sponsored
Curation and promotions
GET
/v1/admin/audit-log
Audit trail
10.5 Field app and settings
Method
Path
Purpose
GET
/v1/field/me/areas
Assigned beats with boundaries
GET
/v1/field/leads?area_id=
Leads to visit
GET
/v1/field/places/nearby?lat=&lng=
Existing places and leads within 200 m, for duplicate checks
POST
/v1/field/submissions/sync
Batch upload of offline captures (idempotent by client_uuid)
POST
/v1/field/visits
Log a visit outcome
GET
/v1/field/me/stats
Progress and sent-back items
POST
/v1/admin/leads/import
Upload a CSV of internet-sourced leads
GET, POST
/v1/admin/field/submissions, /{id}/approve, /{id}/send-back
Field capture review
GET, PUT
/v1/admin/settings
Feature flags, global and per city
GET
/v1/config
Public start-up config: brand name, logo, colours, enabled features
Example listing response (trimmed):
{
  "data": [{
    "id": "b7c1…",
    "name": "The Bombay Canteen",
    "cover_photo": "https://cdn.twiggytomato.com/r/b7c1/cover.webp",
    "rating": 4.4, "review_count": 2104,
    "cuisines": ["Modern Indian", "Bar food"],
    "cost_for_two": { "amount": 180000, "currency": "INR" },
    "distance_m": 1200,
    "open_status": { "is_open": true, "closes_at": "23:00" },
    "locality": "Lower Parel",
    "offer": "20% off on weekdays",
    "tags": ["Serves alcohol", "Outdoor seating"],
    "is_promoted": false
  }],
  "next_cursor": "eyJvZmZzZXQiOjIwfQ"
}
11. Quality, security, metrics and roadmap
11.1 Non-functional requirements
Area
Target
Listing / search API latency
p95 < 300 ms
Restaurant detail API latency
p95 < 200 ms (cached)
App cold start to first cards
< 2.5 s on a mid-range Android phone over 4G
Availability
99.9% monthly for diner APIs
Scale (year 1)
50,000 restaurants, 1M monthly users, 200 requests/s peak
Images
Served as WebP/AVIF via CDN in 3 sizes; max upload 10 MB
Accessibility
WCAG 2.1 AA on web; screen-reader labels on mobile
Localisation
Hindi and English at launch; restaurant names stored in both; strings externalised for more languages
11.2 Security and privacy
• HTTPS everywhere; JWTs signed with rotated keys; refresh tokens stored hashed and revocable.
• Role-based access checked on every partner and admin endpoint, scoped to restaurant_members.
• Rate limits: OTP 5 per hour per phone; reviews 10 per day per user; general 60 requests/min per IP for unauthenticated calls.
• Uploads through pre-signed URLs, virus-scanned and EXIF-stripped (removes diner GPS data).
• Partner documents in a private bucket, encrypted at rest, visible only to admins.
• Compliance with India's DPDP Act 2023 (and GDPR if expanding): consent for location, data export and account deletion within 30 days.
• Location is used only for the current request; precise history is not stored.
11.3 Success metrics
• Diner: weekly active users, searches per session, detail-page views per session, action rate (call, directions, book) per detail view, D30 retention.
• Supply: live restaurants per city, % claimed, % with digital menu, % with hours confirmed in the last 60 days.
• Content: reviews per week, % reviews with photos, moderation turnaround.
• Event tracking: app_open, location_set, search, filter_apply, card_impression, card_tap, detail_tab_view, action_call, action_directions, action_share, save, review_submit.
11.4 Roadmap
1. Phase 0 — Foundations (weeks 1–3): designs, schema, auth, CI/CD, infra, brand config and feature flags.
2. Phase 1a — Field app and data seeding (weeks 3–8): field app, lead import, capture review in admin console; field team starts in Neem Ka Thana, then nearby towns.
3. Phase 1b — MVP (weeks 6–14): location, feed, cards, filters, search, detail page, reviews in Hindi and English; partner onboarding, claims, profile, hours, menu, photos; admin verification and moderation. Public launch once the launch towns are covered.
4. Phase 2 — Growth (months 4–6): collections, personal lists, offers, partner analytics, AI review summaries, multi-outlet, sponsored listings switched on when traffic allows.
5. Phase 3 — Transactions (months 7+): table reservations, online ordering and delivery, payments, loyalty.
11.5 Decisions
Question
Decision
Launch region and seeding
Neem Ka Thana, Rajasthan and nearby towns; a field team collects data with a dedicated field app, and internet sources supply leads to verify (section 7)
Native or cross-platform
Cross-platform: React Native for the diner and field apps, Next.js for web. One language (TypeScript) across apps and backend suits a small team
Sponsored listings
Built in v1, off by a feature flag at launch; switched on when traffic justifies it
Unclaimed listings
Supported; admins turn them on or off globally or per city
Brand name
Decide later; the product is built so the name can change without a code rewrite (11.6)
11.6 Rebrand readiness
• App name, logo, icon, colours and support contacts come from brand_config and /v1/config, never hard-coded in screens.
• All user-facing strings live in translation files; the brand name is a variable inside them.
• Neutral technical identifiers: company-based bundle and package ids (e.g. com.<company>.diner), API host such as api.<company-domain>, database and repo names without the brand.
• Store listings, domain and app icons are the only parts that need a manual change; keep them in one release checklist.
• Restaurant web pages use neutral URLs (/r/<city>/<slug>) so links survive a domain change with redirects.