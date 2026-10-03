// Offline field captures and visits (spec 7.3): the shape kept on the phone and sent to /v1/field/submissions/sync.

/** A place captured on the ground, kept on the device until the server accepts it (spec 7.3). */
export type CapturePhoto = {
  dataUrl?: string;
  url?: string;
  width?: number;
  height?: number;
  category: 'food' | 'ambience' | 'menu' | 'exterior';
  /** Camera position from EXIF, for reviewer QA only (spec 7.3). */
  exif?: { lat?: number; lng?: number; takenAt?: string };
};
export type CapturePayload = {
  name: string;
  nameHi: string | null;
  cityId: string;
  localityId: string | null;
  addressLine: string;
  landmark: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  whatsapp: string | null;
  typeSlug: string | null;
  cuisineSlugs: string[];
  attributeKeys: string[];
  /** Rupees. */
  costForTwo: number;
  knownFor: string[];
  hours: { dayOfWeek: number; opensAt: string; closesAt: string }[];
  ownerName: string | null;
  ownerPhone: string | null;
  ownerConsent: boolean;
  wantsToManage: boolean;
  notes: string | null;
  photos: CapturePhoto[];
};
export type QueuedCapture = {
  clientUuid: string;
  leadId: string | null;
  capturedAt: string;
  gpsAccuracyM: number | null;
  payload: CapturePayload;
  /** Set when the server rejected it; the agent must fix and resave. */
  error?: string;
};
export type VisitOutcome = 'captured' | 'closed' | 'refused' | 'revisit' | 'duplicate' | 'not_found';
export type QueuedVisit = {
  clientUuid: string;
  leadId: string | null;
  restaurantId?: string | null;
  outcome: VisitOutcome;
  revisitOn?: string | null;
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
  error?: string;
};
