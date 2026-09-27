export type Product = {
  id: string;
  size: string;
  weight: string;
  price: number;
  consigne: number;
  tag?: string;
  available: boolean;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  zone: string;
  vehicle?: string;
  active: boolean;
};

export type Vendor = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  commune: string;
  address: string;
  lat?: number;
  lng?: number;
  active: boolean;
};

export type Accessory = {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  available: boolean;
};

export type ClientProfile = {
  fullName: string;
  phone: string;
  whatsapp: string;
  addresses: {
    id: string;
    label: string;
    commune: string;
    quartier: string;
    avenue: string;
    parcelle: string;
    repere: string;
  }[];
  payments: {
    id: string;
    method: "mpesa" | "orange" | "airtel" | "cash";
    number: string;
  }[];
};

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: "6",
    size: "Petit foyer",
    weight: "6 kg",
    price: 25000,
    consigne: 35000,
    tag: "Populaire",
    available: true,
  },
  {
    id: "12",
    size: "Famille",
    weight: "12 kg",
    price: 45000,
    consigne: 55000,
    tag: "Best-seller",
    available: true,
  },
  { id: "25", size: "Restaurant", weight: "25 kg", price: 89000, consigne: 90000, available: true },
  { id: "50", size: "Pro", weight: "50 kg", price: 165000, consigne: 140000, available: true },
];

export const DEFAULT_DRIVERS: Driver[] = [
  {
    id: "paul",
    name: "Paul Mbemba",
    phone: "+243 810 000 001",
    zone: "Limete",
    vehicle: "Moto Boxer",
    active: true,
  },
  {
    id: "eric",
    name: "Eric Ilunga",
    phone: "+243 810 000 002",
    zone: "Gombe",
    vehicle: "Moto TVS",
    active: true,
  },
  {
    id: "jose",
    name: "José Kabongo",
    phone: "+243 810 000 003",
    zone: "Ngaliema",
    vehicle: "Moto Boxer",
    active: true,
  },
  {
    id: "sarah",
    name: "Sarah Tshibanda",
    phone: "+243 810 000 004",
    zone: "Kalamu",
    vehicle: "Tricycle",
    active: true,
  },
];

export const DEFAULT_VENDORS: Vendor[] = [
  {
    id: "v1",
    name: "Dépôt Gombe Centre",
    contact: "Jean K.",
    phone: "+243 820 111 111",
    commune: "Gombe",
    address: "Av. du Commerce 45",
    lat: -4.3169,
    lng: 15.3131,
    active: true,
  },
  {
    id: "v2",
    name: "Point Limete Industriel",
    contact: "Marie L.",
    phone: "+243 820 222 222",
    commune: "Limete",
    address: "Bd Lumumba 210",
    lat: -4.3547,
    lng: 15.3383,
    active: true,
  },
];

export const DEFAULT_ACCESSORIES: Accessory[] = [
  {
    id: "a1",
    name: "Kit détendeur + tuyau",
    description: "Détendeur standard + tuyau 1.5m",
    price: 15000,
    stock: 50,
    available: true,
  },
  {
    id: "a2",
    name: "Réchaud 2 feux",
    description: "Réchaud à gaz 2 feux inox",
    price: 45000,
    stock: 12,
    available: true,
  },
  {
    id: "a3",
    name: "Tuyau renforcé 3m",
    description: "Tuyau haute pression",
    price: 8000,
    stock: 30,
    available: true,
  },
  {
    id: "a4",
    name: "Détendeur seul",
    description: "Détendeur de rechange",
    price: 9000,
    stock: 25,
    available: true,
  },
];

// Legacy export for admin.tsx compatibility
export const DRIVERS = DEFAULT_DRIVERS.map((d) => ({ id: d.id, name: d.name, zone: d.zone }));

const ORDERS_KEY = "bellagaz.orders";
const PRODUCTS_KEY = "bellagaz.products";
const DRIVERS_KEY = "bellagaz.drivers";
const VENDORS_KEY = "bellagaz.vendors";
const ACCESSORIES_KEY = "bellagaz.accessories";
const PROFILE_KEY = "bellagaz.profile";
const ADMIN_AUTH_KEY = "bellagaz.admin.auth";
const ADMIN_PIN_KEY = "bellagaz.admin.pin";
const EVT = "bellagaz:update";

const isBrowser = () => typeof window !== "undefined";

function loadJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function loadOrders<T = unknown>(): T[] {
  return loadJSON<T[]>(ORDERS_KEY, []);
}
export function saveOrders(orders: unknown[]) {
  saveJSON(ORDERS_KEY, orders);
}

export function loadProducts(): Product[] {
  const p = loadJSON<Product[]>(PRODUCTS_KEY, DEFAULT_PRODUCTS);
  return Array.isArray(p) && p.length > 0 ? p : DEFAULT_PRODUCTS;
}
export function saveProducts(p: Product[]) {
  saveJSON(PRODUCTS_KEY, p);
}

export function loadDrivers(): Driver[] {
  const d = loadJSON<Driver[]>(DRIVERS_KEY, DEFAULT_DRIVERS);
  return Array.isArray(d) && d.length > 0 ? d : DEFAULT_DRIVERS;
}
export function saveDrivers(d: Driver[]) {
  saveJSON(DRIVERS_KEY, d);
}

export function loadVendors(): Vendor[] {
  const v = loadJSON<Vendor[]>(VENDORS_KEY, DEFAULT_VENDORS);
  return Array.isArray(v) ? v : DEFAULT_VENDORS;
}
export function saveVendors(v: Vendor[]) {
  saveJSON(VENDORS_KEY, v);
}

export function loadAccessories(): Accessory[] {
  const a = loadJSON<Accessory[]>(ACCESSORIES_KEY, DEFAULT_ACCESSORIES);
  return Array.isArray(a) && a.length > 0 ? a : DEFAULT_ACCESSORIES;
}
export function saveAccessories(a: Accessory[]) {
  saveJSON(ACCESSORIES_KEY, a);
}

export function loadProfile(): ClientProfile {
  return loadJSON<ClientProfile>(PROFILE_KEY, {
    fullName: "",
    phone: "",
    whatsapp: "",
    addresses: [],
    payments: [],
  });
}
export function saveProfile(p: ClientProfile) {
  saveJSON(PROFILE_KEY, p);
}

// Admin auth (client-side PIN gate)
export function getAdminPin(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(ADMIN_PIN_KEY);
}
export function setAdminPin(pin: string) {
  if (!isBrowser()) return;
  localStorage.setItem(ADMIN_PIN_KEY, pin);
}
export function isAdminAuthed(): boolean {
  if (!isBrowser()) return false;
  return sessionStorage.getItem(ADMIN_AUTH_KEY) === "1";
}
export function setAdminAuthed(v: boolean) {
  if (!isBrowser()) return;
  if (v) sessionStorage.setItem(ADMIN_AUTH_KEY, "1");
  else sessionStorage.removeItem(ADMIN_AUTH_KEY);
}

export function subscribe(cb: () => void) {
  if (!isBrowser()) return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}
