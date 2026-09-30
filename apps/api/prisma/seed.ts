// Development seed. All restaurants, people and reviews below are FICTIONAL sample data.
// Town coordinates are approximate and must be confirmed by the first field survey.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const cities = [
  {
    key: 'nkt', name: 'Neem Ka Thana', nameHi: 'नीम का थाना', lat: 27.735, lng: 75.78,
    localities: [
      ['Main Bazaar', 'मुख्य बाज़ार', 27.7365, 75.7812],
      ['Bus Stand', 'बस स्टैंड', 27.7322, 75.7768],
      ['Station Road', 'स्टेशन रोड', 27.7391, 75.7743],
      ['Kotputli Road', 'कोटपूतली रोड', 27.7298, 75.7885],
    ],
  },
  { key: 'patan', name: 'Patan', nameHi: 'पाटन', lat: 27.8, lng: 75.98, localities: [['Patan Bazaar', 'पाटन बाज़ार', 27.8008, 75.9812]] },
  { key: 'khetri', name: 'Khetri', nameHi: 'खेतड़ी', lat: 28.0, lng: 75.79, localities: [['Khetri Town', 'खेतड़ी कस्बा', 28.0012, 75.7905]] },
  { key: 'smp', name: 'Shrimadhopur', nameHi: 'श्रीमाधोपुर', lat: 27.47, lng: 75.6, localities: [['Shrimadhopur Market', 'श्रीमाधोपुर बाज़ार', 27.4705, 75.6011]] },
  { key: 'ktp', name: 'Kotputli', nameHi: 'कोटपूतली', lat: 27.7, lng: 76.2, localities: [['NH-48 Highway', 'एनएच-48 हाईवे', 27.7031, 76.1962]] },
] as const;

const cuisines = [
  ['north-indian', 'North Indian', 'उत्तर भारतीय', '🍛'],
  ['rajasthani', 'Rajasthani', 'राजस्थानी', '🫓'],
  ['thali', 'Thali', 'थाली', '🍱'],
  ['south-indian', 'South Indian', 'दक्षिण भारतीय', '🥞'],
  ['chinese', 'Chinese', 'चाइनीज़', '🥡'],
  ['fast-food', 'Fast Food', 'फ़ास्ट फ़ूड', '🍔'],
  ['street-food', 'Street Food', 'स्ट्रीट फ़ूड', '🥙'],
  ['sweets', 'Sweets', 'मिठाई', '🍬'],
  ['bakery', 'Bakery', 'बेकरी', '🧁'],
  ['chai-snacks', 'Chai & Snacks', 'चाय-नाश्ता', '☕'],
  ['pizza', 'Pizza', 'पिज़्ज़ा', '🍕'],
  ['ice-cream', 'Ice Cream', 'आइसक्रीम', '🍨'],
  ['beverages', 'Beverages', 'पेय', '🥤'],
] as const;

const types = [
  ['casual-dining', 'Casual dining', 'कैज़ुअल डाइनिंग'],
  ['fine-dining', 'Fine dining', 'फ़ाइन डाइनिंग'],
  ['cafe', 'Café', 'कैफ़े'],
  ['qsr', 'Quick service', 'क्विक सर्विस'],
  ['bakery', 'Bakery', 'बेकरी'],
  ['dessert-parlour', 'Dessert parlour', 'डेज़र्ट पार्लर'],
  ['dhaba', 'Dhaba', 'ढाबा'],
  ['sweet-shop', 'Sweet shop', 'मिठाई की दुकान'],
  ['bhojanalaya', 'Bhojanalaya', 'भोजनालय'],
  ['street-food-stall', 'Street food stall', 'ठेला / स्टॉल'],
  ['food-court', 'Food court', 'फ़ूड कोर्ट'],
  ['cloud-kitchen', 'Cloud kitchen', 'क्लाउड किचन'],
  ['food-truck', 'Food truck', 'फ़ूड ट्रक'],
  ['bar-pub', 'Bar / pub', 'बार / पब'],
] as const;

const attributes = [
  ['pure_veg', 'Pure veg', 'शुद्ध शाकाहारी', 'dietary', '🟢'],
  ['jain', 'Jain food', 'जैन भोजन', 'dietary', '🙏'],
  ['vegan_options', 'Vegan options', 'वीगन विकल्प', 'dietary', '🌱'],
  ['eggless', 'Eggless', 'अंडा रहित', 'dietary', '🥚'],
  ['outdoor_seating', 'Outdoor seating', 'बाहर बैठने की जगह', 'feature', '🌳'],
  ['rooftop', 'Rooftop', 'रूफ़टॉप', 'feature', '🏙️'],
  ['family_friendly', 'Family friendly', 'परिवार के लिए', 'feature', '👨‍👩‍👧'],
  ['ac', 'Air-conditioned', 'एसी', 'feature', '❄️'],
  ['wifi', 'Wi-Fi', 'वाई-फ़ाई', 'feature', '📶'],
  ['parking', 'Parking', 'पार्किंग', 'feature', '🅿️'],
  ['wheelchair', 'Wheelchair accessible', 'व्हीलचेयर सुलभ', 'feature', '♿'],
  ['live_music', 'Live music', 'लाइव संगीत', 'feature', '🎶'],
  ['private_dining', 'Private dining', 'प्राइवेट डाइनिंग', 'feature', '🚪'],
  ['kid_friendly', 'Kid friendly', 'बच्चों के लिए', 'feature', '🧒'],
  ['pet_friendly', 'Pet friendly', 'पालतू अनुकूल', 'feature', '🐕'],
  ['serves_alcohol', 'Serves alcohol', 'शराब उपलब्ध', 'feature', '🍷'],
  ['dine_in', 'Dine-in', 'बैठकर खाना', 'service', '🍽️'],
  ['takeaway', 'Takeaway', 'पैक करवाएं', 'service', '🥡'],
  ['delivery', 'Delivery', 'होम डिलीवरी', 'service', '🛵'],
  ['table_reservation', 'Table reservation', 'टेबल बुकिंग', 'service', '📅'],
  ['upi', 'UPI', 'यूपीआई', 'payment', '📱'],
  ['card', 'Cards', 'कार्ड', 'payment', '💳'],
  ['cash', 'Cash', 'नकद', 'payment', '💵'],
  ['gluten_free', 'Gluten-free options', 'ग्लूटेन-फ़्री विकल्प', 'dietary', '🌾'],
  ['halal', 'Halal', 'हलाल', 'dietary', '☪️'],
  ['smoking_area', 'Smoking area', 'धूम्रपान क्षेत्र', 'feature', '🚬'],
  ['breakfast', 'Breakfast', 'नाश्ता', 'occasion', '🍳'],
  ['lunch', 'Lunch', 'दोपहर का खाना', 'occasion', '🍛'],
  ['dinner', 'Dinner', 'रात का खाना', 'occasion', '🌙'],
  ['late_night', 'Late night', 'देर रात', 'occasion', '🌃'],
  ['brunch', 'Brunch', 'ब्रंच', 'occasion', '🥞'],
  ['date_night', 'Date night', 'डेट नाइट', 'occasion', '💑'],
  ['family_outing', 'Family', 'परिवार के साथ', 'occasion', '👪'],
  ['work_friendly', 'Work-friendly', 'काम के लिए', 'occasion', '💻'],
] as const;

// Common misspellings and transliterations (spec 3.1).
const synonyms: [string, string][] = [
  ['biriyani', 'biryani'], ['briyani', 'biryani'], ['biryaani', 'biryani'], ['cafe', 'café'], ['coffe', 'coffee'],
  ['chowmin', 'chowmein'], ['chowmien', 'chowmein'], ['panner', 'paneer'], ['panir', 'paneer'], ['dosai', 'dosa'],
  ['thaali', 'thali'], ['kachauri', 'kachori'], ['kachodi', 'kachori'], ['momo', 'momos'], ['piza', 'pizza'],
  ['burgur', 'burger'], ['samose', 'samosa'], ['lasi', 'lassi'], ['chai', 'chai'], ['sweets', 'sweets'],
  ['mithai', 'sweets'], ['dhaba', 'dhaba'], ['icecream', 'ice cream'], ['ice-cream', 'ice cream'],
];

type Item = [name: string, price: number, diet?: string, tags?: string[], description?: string];
type Sample = {
  name: string; nameHi: string; city: string; locality?: string; type: string; cuisines: string[]; attrs: string[];
  cost: number; hours: [string, string][] | 'allday'; closedDays?: number[]; phone?: string; description?: string;
  knownFor?: string; claimed: boolean; source?: string; ageDays?: number; offer?: string; menu: Record<string, Item[]>;
  dLat?: number; dLng?: number;
};

const samples: Sample[] = [
  {
    name: 'Shree Balaji Bhojanalaya', nameHi: 'श्री बालाजी भोजनालय', city: 'nkt', locality: 'Main Bazaar', type: 'bhojanalaya',
    cuisines: ['thali', 'rajasthani', 'north-indian'], attrs: ['pure_veg', 'family_friendly', 'dine_in', 'takeaway', 'upi', 'cash'],
    cost: 250, hours: [['11:00', '15:30'], ['19:00', '22:30']], phone: '9811100001', claimed: true,
    description: 'Unlimited Rajasthani thali served hot since 1998. Simple, clean and always busy at lunch.',
    knownFor: 'Rajasthani Thali, Dal Baati Churma, Gatte ki Sabzi', offer: '10% off on weekday lunch thali',
    menu: {
      Thali: [['Rajasthani Thali (unlimited)', 180, 'veg', ['bestseller']], ['Mini Thali', 120, 'veg']],
      Specials: [['Dal Baati Churma', 150, 'veg', ['bestseller']], ['Gatte ki Sabzi', 110], ['Ker Sangri', 140, 'veg', ['chef_special']]],
      Breads: [['Tawa Roti', 10], ['Bajra Roti', 15], ['Missi Roti', 20]],
    },
  },
  {
    name: 'Highway King Dhaba', nameHi: 'हाईवे किंग ढाबा', city: 'nkt', locality: 'Kotputli Road', type: 'dhaba',
    cuisines: ['north-indian', 'chinese'], attrs: ['outdoor_seating', 'parking', 'dine_in', 'takeaway', 'upi', 'cash', 'family_friendly'],
    cost: 400, hours: 'allday', phone: '9811100002', claimed: true, dLat: -0.004, dLng: 0.006,
    description: 'Open 24 hours on the highway with charpai seating and a big parking lot for trucks and families.',
    knownFor: 'Paneer Butter Masala, Dal Makhani, Lassi',
    menu: {
      'Main Course': [['Paneer Butter Masala', 220, 'veg', ['bestseller']], ['Dal Makhani', 170], ['Mix Veg', 150], ['Egg Curry', 160, 'egg']],
      Breads: [['Butter Naan', 40], ['Lachha Paratha', 45]],
      Chinese: [['Veg Chowmein', 120], ['Manchurian Dry', 140, 'veg', [], 'Crispy veg balls tossed in soy-chilli']],
      Drinks: [['Sweet Lassi', 60, 'veg', ['bestseller']], ['Masala Chai', 20]],
    },
  },
  {
    name: 'Gupta Mishthan Bhandar', nameHi: 'गुप्ता मिष्ठान भंडार', city: 'nkt', locality: 'Main Bazaar', type: 'sweet-shop',
    cuisines: ['sweets', 'street-food'], attrs: ['pure_veg', 'takeaway', 'dine_in', 'upi', 'cash', 'eggless'],
    cost: 150, hours: [['07:00', '22:00']], phone: '9811100003', claimed: true, dLat: 0.0006, dLng: -0.0004,
    description: 'Fresh mawa sweets, hot kachori in the morning and ghewar in the monsoon season.',
    knownFor: 'Pyaaz Kachori, Mawa Barfi, Ghewar', offer: 'Buy 1 kg sweets, get 250 g namkeen free',
    menu: {
      Sweets: [['Mawa Barfi (250 g)', 120, 'veg', ['bestseller']], ['Ghewar', 80], ['Rasgulla (2 pc)', 40], ['Kaju Katli (250 g)', 250]],
      Snacks: [['Pyaaz Kachori', 25, 'veg', ['bestseller']], ['Samosa', 15], ['Mirchi Bada', 20, 'veg', ['new']]],
    },
  },
  {
    name: 'Chai Adda', nameHi: 'चाय अड्डा', city: 'nkt', locality: 'Bus Stand', type: 'street-food-stall',
    cuisines: ['chai-snacks', 'street-food'], attrs: ['pure_veg', 'takeaway', 'cash', 'upi'],
    cost: 60, hours: [['05:30', '21:00']], claimed: false, source: 'field', dLat: 0.0003,
    knownFor: 'Kulhad Chai, Bread Pakoda',
    menu: { Menu: [['Kulhad Chai', 15, 'veg', ['bestseller']], ['Bread Pakoda', 20], ['Poha', 30]] },
  },
  {
    name: 'Cafe Aroma', nameHi: 'कैफ़े अरोमा', city: 'nkt', locality: 'Station Road', type: 'cafe',
    cuisines: ['fast-food', 'pizza', 'beverages'], attrs: ['ac', 'wifi', 'dine_in', 'takeaway', 'delivery', 'upi', 'card', 'kid_friendly'],
    cost: 450, hours: [['11:00', '23:00']], closedDays: [], phone: '9811100005', claimed: true, ageDays: 20,
    description: 'A new air-conditioned cafe for coffee, pizza and board games. Popular with college students.',
    knownFor: 'Cold Coffee, Farmhouse Pizza', offer: '20% off on weekdays 3–6 pm',
    menu: {
      Pizza: [['Margherita (8")', 180], ['Farmhouse (8")', 240, 'veg', ['bestseller']], ['Paneer Tikka (8")', 260, 'veg', ['new']]],
      Burgers: [['Aloo Tikki Burger', 70], ['Cheese Burger', 110]],
      Drinks: [['Cold Coffee', 120, 'veg', ['bestseller']], ['Hot Cappuccino', 100], ['Oreo Shake', 140]],
    },
  },
  {
    name: 'Royal Rajputana Restaurant', nameHi: 'रॉयल राजपूताना रेस्टोरेंट', city: 'nkt', locality: 'Station Road', type: 'casual-dining',
    cuisines: ['north-indian', 'rajasthani', 'chinese'], attrs: ['ac', 'family_friendly', 'parking', 'dine_in', 'takeaway', 'table_reservation', 'private_dining', 'upi', 'card', 'cash'],
    cost: 700, hours: [['12:00', '15:30'], ['19:00', '23:00']], phone: '9811100006', claimed: true, dLat: -0.0015,
    description: 'Family restaurant with a party hall for birthdays and kitty parties. Veg and non-veg kitchens are separate.',
    knownFor: 'Laal Maas, Paneer Lababdar, Veg Biryani',
    menu: {
      Starters: [['Paneer Tikka', 240, 'veg', ['bestseller']], ['Chicken Tikka', 280, 'non_veg']],
      'Main Course': [['Laal Maas', 380, 'non_veg', ['chef_special'], 'Fiery Rajasthani mutton curry'], ['Paneer Lababdar', 260], ['Veg Biryani', 200]],
      Desserts: [['Gulab Jamun (2 pc)', 60], ['Moong Dal Halwa', 90]],
    },
  },
  {
    name: 'Anand Sweets & Bakers', nameHi: 'आनंद स्वीट्स एंड बेकर्स', city: 'nkt', locality: 'Bus Stand', type: 'bakery',
    cuisines: ['bakery', 'sweets'], attrs: ['eggless', 'takeaway', 'upi', 'cash'], cost: 200, hours: [['08:00', '21:30']],
    claimed: false, source: 'field', dLng: 0.001,
    knownFor: 'Eggless Black Forest Cake, Rusk',
    menu: { Bakery: [['Eggless Black Forest (500 g)', 350, 'veg', ['bestseller']], ['Veg Puff', 25], ['Cream Roll', 20]] },
  },
  {
    name: 'Madras Dosa Corner', nameHi: 'मद्रास डोसा कॉर्नर', city: 'nkt', locality: 'Main Bazaar', type: 'qsr',
    cuisines: ['south-indian'], attrs: ['pure_veg', 'dine_in', 'takeaway', 'upi', 'cash'], cost: 200,
    hours: [['08:00', '14:00'], ['17:00', '22:00']], closedDays: [2], phone: '9811100008', claimed: true, dLat: 0.0012, dLng: 0.0008,
    knownFor: 'Masala Dosa, Idli Sambar',
    menu: { Dosa: [['Masala Dosa', 90, 'veg', ['bestseller']], ['Paper Dosa', 110], ['Mysore Dosa', 110]], Idli: [['Idli Sambar', 60], ['Medu Vada', 60]] },
  },
  {
    name: 'Kwality Ice Cream Parlour', nameHi: 'क्वालिटी आइसक्रीम पार्लर', city: 'nkt', locality: 'Station Road', type: 'dessert-parlour',
    cuisines: ['ice-cream', 'beverages'], attrs: ['pure_veg', 'takeaway', 'kid_friendly', 'upi'], cost: 150,
    hours: [['12:00', '23:30']], claimed: false, source: 'field', dLat: 0.002, knownFor: 'Kulfi Falooda',
    menu: { 'Ice Cream': [['Kulfi Falooda', 80, 'veg', ['bestseller']], ['Butterscotch Scoop', 50], ['Sundae', 120]] },
  },
  {
    name: 'Patan Fort View Dhaba', nameHi: 'पाटन फ़ोर्ट व्यू ढाबा', city: 'patan', type: 'dhaba',
    cuisines: ['rajasthani', 'north-indian'], attrs: ['outdoor_seating', 'rooftop', 'parking', 'dine_in', 'cash', 'upi'], cost: 350,
    hours: [['10:00', '23:00']], phone: '9811100010', claimed: true, knownFor: 'Bajra Khichda, Dal Baati',
    menu: { Mains: [['Dal Baati (3 pc)', 140, 'veg', ['bestseller']], ['Bajra Khichda', 120], ['Kadhi Pakoda', 110]] },
  },
  {
    name: 'Khetri Copper Town Cafe', nameHi: 'खेतड़ी कॉपर टाउन कैफ़े', city: 'khetri', type: 'cafe',
    cuisines: ['fast-food', 'chinese', 'beverages'], attrs: ['ac', 'wifi', 'dine_in', 'upi', 'card'], cost: 400,
    hours: [['10:00', '22:00']], phone: '9811100011', claimed: true, knownFor: 'Hakka Noodles, Masala Fries',
    menu: { Snacks: [['Masala Fries', 90], ['Hakka Noodles', 130, 'veg', ['bestseller']], ['Veg Momos (8 pc)', 90]] },
  },
  {
    name: 'Shri Shyam Bhojanalaya', nameHi: 'श्री श्याम भोजनालय', city: 'smp', type: 'bhojanalaya',
    cuisines: ['thali', 'north-indian'], attrs: ['pure_veg', 'jain', 'dine_in', 'takeaway', 'cash'], cost: 200,
    hours: [['11:00', '15:00'], ['19:00', '22:00']], claimed: false, source: 'field', knownFor: 'Jain Thali',
    menu: { Thali: [['Regular Thali', 110], ['Jain Thali', 130, 'veg', ['bestseller'], 'No onion, no garlic, no root vegetables']] },
  },
  {
    name: 'NH-48 Punjabi Dhaba', nameHi: 'एनएच-48 पंजाबी ढाबा', city: 'ktp', type: 'dhaba',
    cuisines: ['north-indian'], attrs: ['outdoor_seating', 'parking', 'dine_in', 'takeaway', 'upi', 'cash', 'family_friendly'], cost: 500,
    hours: [['06:00', '02:00']], phone: '9811100013', claimed: true, knownFor: 'Aloo Paratha, Chole Bhature',
    menu: { Breakfast: [['Aloo Paratha with Butter', 80, 'veg', ['bestseller']], ['Chole Bhature', 120]], Mains: [['Kadhai Paneer', 230], ['Butter Chicken', 320, 'non_veg']] },
  },
];

const dinerNames = ['Rohit Sharma', 'Pooja Saini', 'Vikram Singh', 'Neha Agarwal', 'Aman Meena', 'Kavita Yadav'];
const reviewTexts: [number, string][] = [
  [5, 'Food was fresh and tasty, service was quick even when it was crowded. Will come again with family.'],
  [4, 'Good taste and fair prices. Seating is a little tight during lunch hours but worth the wait.'],
  [5, 'Best in town for this. The staff is polite and the place is clean. Highly recommended.'],
  [3, 'Taste was okay but we waited 25 minutes for our order. Portion size is decent for the price.'],
  [4, 'Nice place for a quick bite. Tried the bestseller and it lived up to the name.'],
  [2, 'Was disappointed this time, the food was cold and they forgot one item. Hope it was a one-off.'],
];

function jitter(seed: number) {
  return ((Math.sin(seed * 9301 + 49297) * 233280) % 1) * 0.0015;
}

async function main() {
  // Wipe in dependency order so the seed can be re-run.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'spatial_ref_sys')`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);

  await prisma.brandConfig.create({
    data: {
      appName: 'TwiggyTomato', shortName: 'TT', tagline: 'Find great food near you', taglineHi: 'अपने आस-पास का बढ़िया खाना खोजें',
      primaryColor: '#e23744', supportEmail: 'support@example.com', supportPhone: '+91-00000-00000',
    },
  });
  await prisma.searchSynonym.createMany({ data: synonyms.filter(([t, c]) => t !== c).map(([term, canonical]) => ({ term, canonical })) });

  const cityIds: Record<string, string> = {};
  const localityIds: Record<string, string> = {};
  for (const c of cities) {
    const city = await prisma.city.create({
      data: { slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: c.name, nameHi: c.nameHi, state: 'Rajasthan', lat: c.lat, lng: c.lng },
    });
    cityIds[c.key] = city.id;
    for (const [name, nameHi, lat, lng] of c.localities) {
      const l = await prisma.locality.create({ data: { cityId: city.id, name, nameHi, lat, lng } });
      localityIds[name] = l.id;
    }
  }
  for (const [slug, name, nameHi, icon] of cuisines) await prisma.cuisine.create({ data: { slug, name, nameHi, icon } });
  for (const [slug, name, nameHi] of types) await prisma.establishmentType.create({ data: { slug, name, nameHi } });
  for (const [key, name, nameHi, group, icon] of attributes) await prisma.attribute.create({ data: { key, name, nameHi, group, icon } });

  const cuisineBySlug = Object.fromEntries((await prisma.cuisine.findMany()).map((c) => [c.slug, c.id]));
  const typeBySlug = Object.fromEntries((await prisma.establishmentType.findMany()).map((t) => [t.slug, t.id]));
  const attrByKey = Object.fromEntries((await prisma.attribute.findMany()).map((a) => [a.key, a.id]));

  const admin = await prisma.user.create({ data: { phone: '9999999999', name: 'Ops Admin', role: 'admin' } });
  const partner = await prisma.user.create({ data: { phone: '8888888888', name: 'Partner Demo' } });
  const agent = await prisma.user.create({ data: { phone: '7777777777', name: 'Field Agent Demo', role: 'field_agent' } });
  await prisma.user.create({ data: { phone: '7777777778', name: 'Field Supervisor Demo', role: 'field_supervisor' } });
  const diners = [];
  for (const [i, name] of dinerNames.entries()) {
    diners.push(await prisma.user.create({ data: { phone: `900000000${i + 1}`, name } }));
  }

  const created: { id: string; name: string }[] = [];
  for (const [i, s] of samples.entries()) {
    const city = cities.find((c) => c.key === s.city)!;
    const loc = s.locality ? city.localities.find((l) => l[0] === s.locality)! : city.localities[0];
    const lat = loc[2] + (s.dLat ?? jitter(i));
    const lng = loc[3] + (s.dLng ?? jitter(i + 50));
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => !(s.closedDays ?? []).includes(d));
    const shifts =
      s.hours === 'allday'
        ? days.map((d) => ({ dayOfWeek: d, opensAt: '00:00', closesAt: '00:00' }))
        : days.flatMap((d) => (s.hours as [string, string][]).map(([o, c]) => ({ dayOfWeek: d, opensAt: o, closesAt: c })));
    const createdAt = new Date(Date.now() - (s.ageDays ?? 200 + i * 10) * 864e5);
    const r = await prisma.restaurant.create({
      data: {
        slug: `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`,
        name: s.name,
        nameHi: s.nameHi,
        description: s.description,
        cityId: cityIds[s.city],
        localityId: localityIds[loc[0]],
        addressLine: `${loc[0]}, ${city.name}`,
        pincode: '332713',
        lat,
        lng,
        phone: s.phone,
        whatsapp: s.phone,
        typeId: typeBySlug[s.type],
        costForTwoPaise: s.cost * 100,
        priceBand: s.cost < 300 ? 1 : s.cost < 600 ? 2 : s.cost < 1200 ? 3 : 4,
        status: 'live',
        isClaimed: s.claimed,
        isVerified: s.claimed,
        source: s.source ?? 'partner',
        capturedById: s.source === 'field' ? agent.id : null,
        ownerConsent: true,
        knownFor: s.knownFor ? s.knownFor.split(',').map((k) => k.trim()) : [],
        fssaiNumber: s.claimed ? `1222101900${String(1000 + i)}` : null,
        hoursConfirmedAt: new Date(Date.now() - 10 * 864e5),
        menuUpdatedAt: new Date(Date.now() - 30 * 864e5),
        createdAt,
        hours: { create: shifts.map((sh, k) => ({ ...sh, shiftNo: shifts.slice(0, k).filter((x) => x.dayOfWeek === sh.dayOfWeek).length + 1 })) },
        cuisines: { create: s.cuisines.map((c, j) => ({ cuisineId: cuisineBySlug[c], isPrimary: j === 0 })) },
        attributes: { create: s.attrs.map((a) => ({ attributeId: attrByKey[a] })) },
        offers: s.offer ? { create: { title: s.offer, terms: 'Not valid with other offers.', validDays: s.offer.includes('weekday') ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6], ...(s.offer.includes('3–6 pm') ? { validFromTime: '15:00', validToTime: '18:00' } : {}) } } : undefined,
      },
    });
    created.push(r);
    let sort = 0;
    for (const [section, items] of Object.entries(s.menu)) {
      const sec = await prisma.menuSection.create({ data: { restaurantId: r.id, name: section, sortOrder: sort++ } });
      for (const [j, [name, price, diet = 'veg', tags = [], description]] of items.entries()) {
        await prisma.menuItem.create({
          data: {
            restaurantId: r.id, sectionId: sec.id, name, pricePaise: price * 100, diet, tags, description, sortOrder: j,
            allergens: /paneer|lassi|barfi|kulfi|shake|coffee|cheese|butter|halwa|ghewar|rasgulla|kaju/i.test(name) ? ['milk'] : [],
            // Half/full portions for curries and thalis (spec 4.3).
            variants: /curry|masala|dal|paneer|thali/i.test(name) && !/unlimited|dosa/i.test(name) && price >= 110
              ? { create: [{ name: 'Half', pricePaise: Math.round(price * 0.6) * 100, sortOrder: 0 }, { name: 'Full', pricePaise: price * 100, sortOrder: 1 }] }
              : undefined,
          },
        });
      }
    }
    if (s.claimed && ['nkt'].includes(s.city) && i < 3) {
      await prisma.restaurantMember.create({ data: { restaurantId: r.id, userId: partner.id, role: 'owner' } });
    }

    // Reviews: 0–6 per place, deterministic.
    const count = (i * 5 + 3) % 7;
    const ratings: number[] = [];
    for (let k = 0; k < count; k++) {
      const [rating, text] = reviewTexts[(i + k) % reviewTexts.length];
      ratings.push(rating);
      const review = await prisma.review.create({
        data: {
          restaurantId: r.id,
          userId: diners[k % diners.length].id,
          rating,
          foodRating: Math.min(5, rating + (k % 2)),
          serviceRating: Math.max(1, rating - (k % 2)),
          ambienceRating: rating,
          valueRating: Math.min(5, rating + 1),
          text,
          helpfulCount: (i + k) % 5,
          createdAt: new Date(Date.now() - (k * 9 + i) * 864e5),
        },
      });
      if (s.claimed && k === 0) {
        await prisma.reviewReply.create({
          data: { reviewId: review.id, userId: partner.id, text: 'Thank you for visiting! We look forward to serving you again.' },
        });
      }
    }
    const breakdown = [0, 0, 0, 0, 0];
    ratings.forEach((x) => breakdown[x - 1]++);
    await prisma.restaurant.update({
      where: { id: r.id },
      data: {
        reviewCount: ratings.length,
        avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : 0,
        ratingBreakdown: breakdown,
      },
    });
  }

  // Sample stats for the partner dashboard.
  for (const r of created.slice(0, 3)) {
    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
      await prisma.analyticsDaily.create({
        data: { restaurantId: r.id, date, views: 20 + ((d * 13) % 40), calls: (d * 3) % 7, directions: (d * 5) % 9, saves: d % 4 },
      });
    }
  }

  // Sponsored placement (hidden until the flag is switched on).
  await prisma.sponsoredPlacement.create({
    data: { restaurantId: created[4].id, startsOn: new Date(), endsOn: new Date(Date.now() + 30 * 864e5) },
  });

  // A draft listing the demo partner is still filling in.
  await prisma.restaurant.create({
    data: {
      slug: 'demo-draft-kitchen', name: 'Demo Draft Kitchen', cityId: cityIds.nkt, localityId: localityIds['Main Bazaar'],
      addressLine: 'Main Bazaar, Neem Ka Thana', lat: 27.7368, lng: 75.7822, costForTwoPaise: 30000, status: 'draft', isClaimed: true,
      members: { create: { userId: partner.id, role: 'owner' } },
    },
  });

  // Leads sourced from the internet, to be verified by the field team.
  const leads = [
    ['Sharma Chaat Bhandar', '9811100101', 'Near Clock Tower', 'directory'],
    ['Maa Durga Rasoi', '9811100102', 'Station Road', 'google_maps'],
    ['Pizza Point', null, 'Bus Stand', 'social'],
    ['Jai Ambe Juice Centre', '9811100104', 'Main Bazaar', 'justdial'],
    ['Om Sai Tea Stall', null, 'Kotputli Road', 'google_maps'],
  ] as const;
  for (const [i, [name, phone, address, source]] of leads.entries()) {
    await prisma.lead.create({
      data: {
        cityId: cityIds.nkt, name, phone, address, source,
        status: i < 3 ? 'assigned' : 'new', assignedToId: i < 3 ? agent.id : null,
      },
    });
  }

  // One field capture waiting for review.
  await prisma.fieldSubmission.create({
    data: {
      agentId: agent.id,
      clientUuid: '00000000-0000-4000-8000-000000000001',
      capturedAt: new Date(Date.now() - 3600_000),
      gpsAccuracyM: 12,
      payload: {
        name: 'Rajdhani Kachori Wala', nameHi: 'राजधानी कचौरी वाला', cityId: cityIds.nkt, localityId: localityIds['Bus Stand'],
        addressLine: 'Opp. Bus Stand, Neem Ka Thana', lat: 27.7327, lng: 75.7771, phone: '9811100201', typeSlug: 'street-food-stall',
        cuisineSlugs: ['street-food', 'chai-snacks'], attributeKeys: ['pure_veg', 'takeaway', 'cash', 'upi'], costForTwo: 80,
        hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: '07:00', closesAt: '13:00' })),
        ownerName: 'Ramesh ji', ownerPhone: '9811100201', ownerConsent: true, wantsToManage: true, notes: 'Very popular in the morning.', photos: [],
      },
    },
  });

  // A diner report for the moderation queue.
  const someReview = await prisma.review.findFirst({ where: { rating: 2 } });
  if (someReview) {
    await prisma.report.create({
      data: { reporterId: partner.id, targetType: 'review', targetId: someReview.id, reason: 'fake', details: 'This person never visited us.' },
    });
  }

  // Seed accounts signed in with OTP, so their phones count as verified (reviews need it).
  await prisma.user.updateMany({ data: { phoneVerified: true } });

  // Meal / occasion tags (spec 3.2) for the "Great breakfasts" style collections.
  const occasions: Record<string, string[]> = {
    'Highway King Dhaba': ['late_night', 'family_outing', 'dinner'],
    'Gupta Mishthan Bhandar': ['breakfast'],
    'Chai Adda': ['breakfast'],
    'Cafe Aroma': ['date_night', 'work_friendly', 'brunch'],
    'Royal Rajputana Restaurant': ['dinner', 'family_outing'],
    'Madras Dosa Corner': ['breakfast', 'lunch'],
    'Shree Balaji Bhojanalaya': ['lunch', 'family_outing'],
    'NH-48 Punjabi Dhaba': ['breakfast', 'late_night'],
  };
  for (const r of created) {
    for (const key of occasions[r.name] ?? []) {
      await prisma.restaurantAttribute.create({ data: { restaurantId: r.id, attributeId: attrByKey[key] } });
    }
  }

  // A holiday closure next week, shown on the page and respected by "open now".
  const aroma = created.find((r) => r.name === 'Cafe Aroma');
  if (aroma) {
    const d = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
    await prisma.specialHour.create({ data: { restaurantId: aroma.id, date: new Date(`${d}T00:00:00Z`), isClosed: true, note: 'Closed for Dussehra' } });
    await prisma.restaurant.update({ where: { id: aroma.id }, data: { bookingUrl: 'https://wa.me/919811100005', dressCode: 'Casual', avgWaitMins: 10, bestTimeToVisit: 'Weekday evenings', parkingInfo: 'Street parking outside' } });
  }

  // An editorial collection (spec 3.4).
  const thaliPlaces = created.filter((r) => ['Shree Balaji Bhojanalaya', 'Shri Shyam Bhojanalaya', 'Royal Rajputana Restaurant'].includes(r.name));
  await prisma.collection.create({
    data: {
      slug: 'best-thalis-around-neem-ka-thana', cityId: cityIds.nkt, title: 'Best thalis around Neem Ka Thana', titleHi: 'नीम का थाना की सबसे अच्छी थालियाँ',
      description: 'Unlimited Rajasthani and Jain thalis our team loves.', type: 'editorial', isPublished: true, sortOrder: 0,
      restaurants: { create: thaliPlaces.map((r, i) => ({ restaurantId: r.id, sortOrder: i })) },
    },
  });

  // A field beat for the demo agent (spec 7.3 "My area").
  const beat = await prisma.fieldArea.create({
    data: {
      cityId: cityIds.nkt, name: 'Main Bazaar & Bus Stand',
      boundary: { type: 'Polygon', coordinates: [[[75.772, 27.729], [75.79, 27.729], [75.79, 27.741], [75.772, 27.741], [75.772, 27.729]]] },
    },
  });
  await prisma.fieldAssignment.create({ data: { areaId: beat.id, agentId: agent.id, startsOn: new Date(Date.now() - 7 * 864e5) } });
  const leadSpots: Record<string, [number, number]> = {
    'Sharma Chaat Bhandar': [27.7361, 75.7806], 'Maa Durga Rasoi': [27.7389, 75.7749], 'Pizza Point': [27.7325, 75.7772],
  };
  for (const [name, [lat, lng]] of Object.entries(leadSpots)) {
    await prisma.lead.updateMany({ where: { name }, data: { lat, lng, areaId: beat.id } });
  }

  await prisma.auditLog.create({ data: { actorId: admin.id, action: 'seed', entityType: 'system', entityId: 'seed' } });
  console.log(`Seeded ${created.length} sample restaurants in ${cities.length} towns.`);
  console.log('Demo logins (OTP 123456 in development): admin 9999999999 · partner 8888888888 · field 7777777777 · diner 9000000001');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
