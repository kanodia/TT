export type OpenStatus =
  | { state: 'unknown' }
  | { state: 'temporarily_closed'; until: string }
  | { state: 'open'; closesAt: string; closesSoon: boolean; allDay: boolean }
  | { state: 'closed'; opensAt: string | null; opensInDays: number | null; note?: string };

export type Named = { name: string; nameHi?: string | null };

export type Card = {
  id: string;
  slug: string;
  citySlug: string;
  name: string;
  nameHi: string | null;
  photos: string[];
  rating: number;
  reviewCount: number;
  cuisines: (Named & { slug: string })[];
  type: (Named & { slug: string }) | null;
  currency: string;
  costForTwo: number;
  priceBand: number;
  distanceM: number | null;
  openStatus: OpenStatus;
  locality: Named | null;
  offer: { title: string } | null;
  tags: (Named & { key: string })[];
  isVerified: boolean;
  isClaimed: boolean;
  isPromoted: boolean;
  lat: number;
  lng: number;
};

export type Listing = { data: Card[]; total: number; nextCursor: string | null };

export type Shift = { dayOfWeek: number; opensAt: string; closesAt: string };
export type SpecialDay = { date: string; isClosed: boolean; opensAt: string | null; closesAt: string | null; note: string | null };

export type Detail = Omit<Card, 'photos'> & {
  photos: { id: string; url: string; category: string; source: string; width: number | null; height: number | null }[];
  photoCount: number;
  description: string | null;
  address: { line: string; landmark: string | null; pincode: string | null; city: string };
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  bookingUrl: string | null;
  socialLinks: { instagram?: string; facebook?: string; youtube?: string };
  fssaiNumber: string | null;
  lastInspectionOn: string | null;
  knownFor: string[];
  highlights: { knownFor: string[]; mustTry: string[]; greatFor: string[] };
  policies: { dressCode: string | null; agePolicy: string | null; alcoholPolicy: string | null };
  parkingInfo: string | null;
  allergenNotes: string | null;
  avgWaitMins: number | null;
  bestTimeToVisit: string | null;
  travel: { mode: 'walk' | 'drive'; minutes: number } | null;
  hours: Shift[];
  todayHours: { windows: { opensAt: string; closesAt: string }[]; note: string | null; isSpecial: boolean };
  specialHours: SpecialDay[];
  attributes: (Named & { key: string; group: string; icon: string | null })[];
  offers: { id: string; title: string; terms: string | null; validFromTime: string | null; validToTime: string | null }[];
  ratingBreakdown: number[];
  aspectRatings: { food: number | null; service: number | null; ambience: number | null; value: number | null };
  reviewSummary: string | null;
  menuItemCount: number;
  hoursConfirmedAt: string | null;
  menuUpdatedAt: string | null;
  isSaved: boolean;
  savedInLists: string[];
  similar: Card[];
};

export type MenuVariant = { id?: string; name: string; price: number };

export type MenuItem = {
  id: string;
  sectionId: string;
  name: string;
  description: string | null;
  price: number;
  diet: 'veg' | 'non_veg' | 'egg' | 'vegan';
  spiceLevel: number;
  tags: string[];
  allergens: string[];
  variants: MenuVariant[];
  photoUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
};
export type MenuSection = { id: string; name: string; sortOrder: number; items: MenuItem[] };

export type Review = {
  id: string;
  rating: number;
  foodRating: number | null;
  serviceRating: number | null;
  ambienceRating: number | null;
  valueRating: number | null;
  text: string;
  visitType: string;
  visitedOn: string | null;
  helpfulCount: number;
  status: string;
  createdAt: string;
  user: { id?: string; name: string | null; avatarUrl?: string | null; level?: number; reviewCount?: number };
  reply: { text: string; createdAt: string } | null;
  photos?: { id: string; url: string }[];
  dishes?: { id: string; name: string }[];
  votedHelpful?: boolean;
};

export type Cuisine = { id: string; slug: string; name: string; nameHi: string | null; icon: string | null; count?: number };
export type EstType = { id: string; slug: string; name: string; nameHi: string | null; count?: number };
export type Attribute = { id: string; key: string; name: string; nameHi: string | null; group: string; icon: string | null; count?: number };
export type Locality = { id: string; name: string; nameHi: string | null; lat: number; lng: number };
export type City = { id: string; slug: string; name: string; nameHi: string | null; state: string; lat: number; lng: number; localities: Locality[] };
export type Filters = { cuisines: Cuisine[]; types: EstType[]; attributes: Attribute[]; cities: City[] };

export type Brand = {
  appName: string;
  shortName: string;
  tagline: string;
  taglineHi: string;
  primaryColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
  supportEmail: string;
  supportPhone: string;
  webDomain: string | null;
};
export type AppConfig = {
  brand: Brand;
  features: { unclaimedListings: boolean; sponsored: boolean; socialLogin: { google: boolean; apple: boolean }; addressSearch: boolean };
  reviewRules: { minChars: number; maxPhotos: number };
};

export type NotificationPrefs = { sms?: boolean; email?: boolean; push?: boolean; digest?: boolean };

export type Me = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  role: 'user' | 'field_agent' | 'field_supervisor' | 'admin';
  notificationPrefs: NotificationPrefs;
  unreadNotifications: number;
  memberships: { role: string; permissions: string[]; restaurant: { id: string; name: string; slug: string; status: string } }[];
};

export type SavedList = {
  id: string;
  name: string;
  kind: 'want_to_go' | 'favourites' | 'custom';
  isPublic: boolean;
  shareSlug: string;
  count?: number;
  cover?: string | null;
};

export type AppNotification = { id: string; template: string; title: string; body: string; payload: Record<string, unknown>; readAt: string | null; createdAt: string };

// ---- Partner ----
export type PartnerArea = 'profile' | 'menu' | 'photos' | 'reviews' | 'offers' | 'team' | 'core' | 'analytics';

export type Verification = {
  id: string;
  restaurantId: string;
  submittedById: string;
  type: 'new' | 'claim' | 'core_change';
  note: string | null;
  payload: Record<string, unknown> | null;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote: string | null;
  createdAt: string;
};

export type PartnerSummary = {
  role: string;
  permissions: PartnerArea[];
  id: string;
  slug: string;
  citySlug: string;
  name: string;
  city: string;
  status: string;
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  cover: string | null;
  latestVerification: Verification | null;
};

export type ProfileInput = {
  name: string;
  nameHi: string | null;
  description: string | null;
  cityId: string;
  localityId: string | null;
  addressLine: string;
  landmark: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  bookingUrl: string | null;
  socialLinks: { instagram?: string; facebook?: string; youtube?: string };
  typeSlug: string | null;
  cuisineSlugs: string[];
  attributeKeys: string[];
  costForTwo: number;
  fssaiNumber: string | null;
  knownFor: string[];
  parkingInfo: string | null;
  allergenNotes: string | null;
  dressCode: string | null;
  agePolicy: string | null;
  alcoholPolicy: string | null;
  avgWaitMins: number | null;
  bestTimeToVisit: string | null;
};

export type PartnerRestaurant = ProfileInput & {
  id: string;
  slug: string;
  status: string;
  isVerified: boolean;
  isClaimed: boolean;
  source: string;
  avgRating: number;
  reviewCount: number;
  temporarilyClosedUntil: string | null;
  hoursConfirmedAt: string | null;
  menuUpdatedAt: string | null;
  hours: (Shift & { id: string })[];
  specialHours: (SpecialDay & { id: string })[];
  verification: Verification[];
  city: { name: string; slug: string };
  myRole: string;
  permissions: PartnerArea[];
};

export type Photo = { id: string; url: string; category: string; source: string; status: string; isCover: boolean; sortOrder: number; width: number | null; height: number | null };

export type Offer = {
  id: string;
  title: string;
  terms: string | null;
  discountType: 'percent' | 'flat' | 'bogo' | 'other';
  value: number | null;
  validDays: number[];
  validFromTime: string | null;
  validToTime: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: 'active' | 'paused' | 'ended';
};
