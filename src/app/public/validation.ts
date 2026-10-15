/** Shared by the public forms and any server-side mirror so both sides enforce identical rules. */

export const VENUE_TYPES = ['Nightclub', 'Hotel Bar', 'Lounge', 'Restaurant', 'Supermarket', 'Retail Store', 'Other'] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const STAFF_COUNTS = ['1-10', '11-25', '26-50', '51-100', '100+'] as const;
export type StaffCount = (typeof STAFF_COUNTS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\d\s.-]{7,20}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value.trim());
}

export interface ContactForm {
  name: string;
  businessName: string;
  venueType: VenueType | '';
  staffCount: StaffCount | '';
  email: string;
  phone: string;
  message: string;
}

export interface ContactPayload extends ContactForm {
  /** Honeypot: real users never fill this. */
  website?: string;
}

export type FieldErrors = Partial<Record<keyof ContactForm, string>>;

export function validateContact(input: ContactForm): FieldErrors {
  const errors: FieldErrors = {};
  if (input.name.trim().length < 2) errors.name = 'Please enter your full name.';
  if (input.businessName.trim().length < 2) errors.businessName = 'Please enter your business name.';
  if (!(VENUE_TYPES as readonly string[]).includes(input.venueType)) errors.venueType = 'Select a business type.';
  if (!(STAFF_COUNTS as readonly string[]).includes(input.staffCount)) errors.staffCount = 'Select your staff count.';
  if (!isValidEmail(input.email.trim())) errors.email = 'Enter a valid email address.';
  if (!PHONE_RE.test(input.phone.trim())) errors.phone = 'Enter a valid phone number.';
  const msg = input.message.trim();
  if (msg.length < 10) errors.message = 'Tell us a little more (at least 10 characters).';
  if (msg.length > 4000) errors.message = 'Message is too long (max 4000 characters).';
  return errors;
}
