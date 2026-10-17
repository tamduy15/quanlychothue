import { db } from './db.ts';
import type { Category, Equipment, Customer, Booking, BookingItem, Transaction } from '../types/index.ts';

export async function initializeDatabaseIfEmpty(force = false) {
  if (!force) {
    const isWiped = await db.system_meta.get('wiped_clean');
    if (isWiped?.value === 'true') {
      return;
    }
    const count = await db.equipment.count();
    if (count > 0) {
      return;
    }
  }

  // 1. Categories
  const categories: Category[] = [
    { name: 'Máy ảnh', slug: 'camera' },
    { name: 'Ống kính (Lens)', slug: 'lens' },
    { name: 'Chống rung (Gimbal)', slug: 'gimbal' },
    { name: 'Phụ kiện & Pin', slug: 'accessories' },
  ];
  await db.categories.bulkAdd(categories);

  // 2. Equipment - Includes User's exact initial CSV gear
  const now = new Date();
  const createdDate = now.toISOString();

  const equipmentList: Equipment[] = [
    {
      asset_code: 'MAY-20260816-203659-870',
      name: '[Trắng] Canon R50',
      category_id: 1,
      brand: 'Canon',
      model: 'EOS R50',
      serial_number: '',
      daily_rate: 150000,
      rate_6h: 100000,
      rate_2days: 250000,
      deposit_rate: 500000,
      keep_cccd: true,
      status: 'available',
      condition: 'good',
      accessories: ['1x Pin LP-E17', '1x Củ sạc', '1x Dây đeo trắng', '1x Thẻ nhớ 64GB', '1x Túi máy'],
      image_url: 'https://drive.google.com/thumbnail?id=1JF88J5zJPV6-jYRfdumX7OAytCBVBMlT&sz=w1200',
      notes: 'Máy Canon R50 màu trắng, cảm biến sạch, quay video 4K sắc nét',
      created_at: createdDate,
    },
    {
      asset_code: 'MAY-20260828-124832-966',
      name: '[Đen] Canon R50',
      category_id: 1,
      brand: 'Canon',
      model: 'EOS R50',
      serial_number: '',
      daily_rate: 150000,
      rate_6h: 100000,
      rate_2days: 250000,
      deposit_rate: 500000,
      keep_cccd: true,
      status: 'rented',
      condition: 'good',
      accessories: ['1x Pin LP-E17', '1x Củ sạc', '1x Dây đeo đen', '1x Thẻ nhớ 64GB', '1x Túi máy'],
      image_url: 'https://drive.google.com/thumbnail?id=14_kRQ_TTKEfvmSKaKdbsLUOhk6BgmvS_&sz=w1200',
      notes: 'Máy Canon R50 màu đen, chụp chân dung & du lịch cực tiện',
      created_at: createdDate,
    },
    {
      asset_code: 'MAY-20261012-132116-902',
      name: 'Đen 2',
      category_id: 1,
      brand: 'Canon',
      model: 'EOS R50',
      serial_number: '',
      daily_rate: 150000,
      rate_6h: 100000,
      rate_2days: 250000,
      deposit_rate: 100,
      keep_cccd: true,
      status: 'available',
      condition: 'good',
      accessories: ['1x Pin', '1x Sạc', '1x Dây đeo'],
      notes: 'Máy dự phòng',
      created_at: createdDate,
    },
    {
      asset_code: 'LEN-RF-S1845-01',
      name: 'Canon RF-S 18-45mm F4.5-6.3 IS STM',
      category_id: 2,
      brand: 'Canon',
      model: 'RF-S 18-45mm',
      serial_number: 'SN-CAN-1845',
      daily_rate: 50000,
      deposit_rate: 300000,
      keep_cccd: false,
      status: 'available',
      condition: 'new',
      accessories: ['Nắp trước sau', 'Filter UV'],
      notes: 'Lens kit góc rộng cho R50',
      created_at: createdDate,
    },
  ];
  await db.equipment.bulkAdd(equipmentList);

  // 3. Customers - Customer requires ONLY name, others optional
  const customers: Customer[] = [
    {
      name: 'Nguyễn Văn Minh (Minh Director)',
      phone: '0908123456',
      email: 'minh.director@media.vn',
      identity_card: '001095018274',
      address: 'Quận 1, TP. Hồ Chí Minh',
      trust_level: 'vip',
      notes: 'Khách quen, giữ máy cẩn thận',
      created_at: createdDate,
    },
    {
      name: 'Thu Trang (Trang Photo)',
      phone: '0912345678',
      trust_level: 'verified',
      notes: 'Thuê máy chụp sự kiện cuối tuần',
      created_at: createdDate,
    },
    {
      name: 'Hải Đăng',
      trust_level: 'normal',
      notes: 'Khách mới chỉ để lại tên',
      created_at: createdDate,
    },
  ];
  await db.customers.bulkAdd(customers);

  // 4. Sample Booking for Timeline Demonstration
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  const start1 = new Date(year, month, day, 8, 0, 0);
  const end1 = new Date(year, month, day + 2, 18, 0, 0);

  const sampleBooking: Booking = {
    booking_code: `BK-${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}-01`,
    customer_id: 1, // Minh Director
    status: 'active',
    start_at: start1.toISOString(),
    end_at: end1.toISOString(),
    total_rent: 300000, // 2 days @ 150k
    is_custom_rent: false,
    calculated_rent: 300000,
    deposit_holding_required: 50000,
    deposit_holding_received: 50000,
    deposit_holding_returned: 50000,
    deposit_security_required: 500000,
    deposit_security_received: 500000,
    deposit_security_returned: 0,
    deposit_required: 500000,
    deposit_received: 500000,
    deposit_returned: 0,
    discount: 0,
    extra_fees: 0,
    handover_notes: 'Bàn giao [Đen] Canon R50 nguyên vẹn, khách giữ cọc 500.000đ',
    created_at: createdDate,
  };
  const bId = await db.bookings.add(sampleBooking);

  // 5. Booking Items
  await db.booking_items.add({
    booking_id: bId,
    equipment_id: 2, // [Đen] Canon R50
    rental_price: 300000,
    condition_on_out: 'Máy hoạt động tốt, cảm biến sạch',
    accessories_checklist: [
      { name: '1x Pin LP-E17', checked_out: true, checked_in: false },
      { name: '1x Củ sạc', checked_out: true, checked_in: false },
      { name: '1x Thẻ nhớ 64GB', checked_out: true, checked_in: false },
      { name: '1x Dây đeo đen', checked_out: true, checked_in: false },
    ],
  });

  // 6. Transactions
  await db.transactions.bulkAdd([
    {
      booking_id: bId,
      type: 'income_rent',
      amount: 300000,
      payment_method: 'transfer',
      date: start1.toISOString(),
      note: 'Thu tiền thuê máy [Đen] Canon R50 đơn BK-...-01',
      is_deposit: false,
    },
    {
      booking_id: bId,
      type: 'deposit_security_in',
      amount: 500000,
      payment_method: 'transfer',
      date: start1.toISOString(),
      note: 'Thu cọc thế chân [Đen] Canon R50 (hoàn khi trả máy)',
      is_deposit: true,
    },
  ]);

  // 7. System Meta
  await db.system_meta.put({
    key: 'last_backup_at',
    value: now.toISOString(),
    updated_at: now.toISOString(),
  });
}

export async function clearAllBookingsAndTransactions() {
  await db.transaction('rw', [db.bookings, db.booking_items, db.transactions, db.equipment], async () => {
    await db.bookings.clear();
    await db.booking_items.clear();
    await db.transactions.clear();
    await db.equipment.toCollection().modify({ status: 'available' });
  });
}

export async function wipeEntireDatabase() {
  await db.transaction(
    'rw',
    [db.categories, db.equipment, db.customers, db.bookings, db.booking_items, db.transactions, db.system_meta],
    async () => {
      await db.categories.clear();
      await db.equipment.clear();
      await db.customers.clear();
      await db.bookings.clear();
      await db.booking_items.clear();
      await db.transactions.clear();
      await db.system_meta.clear();
      await db.system_meta.put({
        key: 'wiped_clean',
        value: 'true',
        updated_at: new Date().toISOString(),
      });
    }
  );
}

export async function resetDatabaseToDefault() {
  await db.transaction(
    'rw',
    [db.categories, db.equipment, db.customers, db.bookings, db.booking_items, db.transactions, db.system_meta],
    async () => {
      await db.categories.clear();
      await db.equipment.clear();
      await db.customers.clear();
      await db.bookings.clear();
      await db.booking_items.clear();
      await db.transactions.clear();
      await db.system_meta.clear();
    }
  );
  await initializeDatabaseIfEmpty(true);
}

