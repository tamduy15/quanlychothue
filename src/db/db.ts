import Dexie, { type Table } from 'dexie';
import type {
  Category,
  Equipment,
  Customer,
  Booking,
  BookingItem,
  Transaction,
  SystemMeta,
} from '../types/index.ts';

export class CineRentDB extends Dexie {
  categories!: Table<Category, number>;
  equipment!: Table<Equipment, number>;
  customers!: Table<Customer, number>;
  bookings!: Table<Booking, number>;
  booking_items!: Table<BookingItem, number>;
  transactions!: Table<Transaction, number>;
  system_meta!: Table<SystemMeta, string>;

  constructor() {
    super('CineRentOfflineDB');
    this.version(1).stores({
      categories: '++id, name, slug',
      equipment: '++id, &asset_code, category_id, status, brand, model, daily_rate',
      customers: '++id, phone, name, identity_card, trust_level',
      bookings: '++id, &booking_code, customer_id, status, start_at, end_at',
      booking_items: '++id, booking_id, equipment_id',
      transactions: '++id, booking_id, type, date, is_deposit',
      system_meta: 'key',
    });
  }
}

export const db = new CineRentDB();
