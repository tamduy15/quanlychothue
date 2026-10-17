import * as XLSX from 'xlsx';
import { db } from '../db/db.ts';
import { normalizeExcelDate, toNormalizedISOString } from './excelDrift.ts';
import { parseVNDateTime, formatDateTimeVN } from './formatters.ts';
import type {
  Category,
  Equipment,
  Customer,
  Booking,
  BookingItem,
  Transaction,
} from '../types/index.ts';

export interface BackupPayload {
  version: string;
  app: string;
  exported_at: string;
  categories: Category[];
  equipment: Equipment[];
  customers: Customer[];
  bookings: Booking[];
  booking_items: BookingItem[];
  transactions: Transaction[];
}

/**
 * Exports the entire database into JSON
 */
export async function exportDatabaseToJSON(): Promise<void> {
  const [categories, equipment, customers, bookings, booking_items, transactions] = await Promise.all([
    db.categories.toArray(),
    db.equipment.toArray(),
    db.customers.toArray(),
    db.bookings.toArray(),
    db.booking_items.toArray(),
    db.transactions.toArray(),
  ]);

  const nowIso = new Date().toISOString();
  const payload: BackupPayload = {
    version: '2.0',
    app: 'CineRent_Offline_PWA',
    exported_at: nowIso,
    categories,
    equipment,
    customers,
    bookings,
    booking_items,
    transactions,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `CineRent_Backup_${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  await db.system_meta.put({
    key: 'last_backup_at',
    value: nowIso,
    updated_at: nowIso,
  });
}

/**
 * Exports all database stores into a structured Excel workbook (.xlsx)
 * Supports user standard columns (id, tenMay, loai, gia6h, gia1Ngay, gia2Ngay, cocTheChanMacDinh...)
 */
export async function exportDatabaseToExcel(): Promise<void> {
  const [equipment, customers, bookings, booking_items, transactions, categories] = await Promise.all([
    db.equipment.toArray(),
    db.customers.toArray(),
    db.bookings.toArray(),
    db.booking_items.toArray(),
    db.transactions.toArray(),
    db.categories.toArray(),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const equipMap = new Map(equipment.map((e) => [e.id, e]));
  const itemsByBookingMap = new Map<number, number[]>();
  for (const bi of booking_items) {
    const list = itemsByBookingMap.get(bi.booking_id) || [];
    list.push(bi.equipment_id);
    itemsByBookingMap.set(bi.booking_id, list);
  }

  // Sheet 1: Kho_Thiet_Bi with user schema compatibility
  const equipmentRows = equipment.map((eq) => ({
    'id': eq.asset_code,
    'tenMay': eq.name,
    'loai': catMap.get(eq.category_id) || 'Máy ảnh',
    'serial': eq.serial_number || '',
    'hinhAnh': eq.image_url || '',
    'trangThai': eq.status === 'available' ? 'HOAT_DONG' : eq.status === 'rented' ? 'DANG_THUE' : 'BAO_DUONG',
    'gia6h': eq.rate_6h || 0,
    'gia1Ngay': eq.daily_rate,
    'gia2Ngay': eq.rate_2days || eq.daily_rate * 2,
    'cocTheChanMacDinh': eq.deposit_rate,
    'giuCCCDMacDinh': eq.keep_cccd ? 'TRUE' : 'FALSE',
    'ghiChu': eq.notes || '',
    'createdAt': formatDateTimeVN(eq.created_at),
    'updatedAt': formatDateTimeVN(eq.updated_at || eq.created_at),
    'phuKienKemTheo': (eq.accessories || []).join('; '),
  }));

  // Sheet 2: Khach_Hang
  const customerRows = customers.map((c) => ({
    'ID': c.id,
    'Tên khách hàng': c.name,
    'Số điện thoại': c.phone || '',
    'CCCD/CMND': c.identity_card || '',
    'Email': c.email || '',
    'Địa chỉ': c.address || '',
    'Zalo / Facebook': c.facebook_zalo || '',
    'Hạng tín nhiệm': c.trust_level,
    'Ghi chú': c.notes || '',
    'Ngày tạo': formatDateTimeVN(c.created_at),
  }));

  // Sheet 3: Don_Thue
  const custMap = new Map(customers.map((c) => [c.id, c]));
  const bookingRows = bookings.map((b) => {
    const cust = custMap.get(b.customer_id);
    const itemIds = itemsByBookingMap.get(b.id!) || [];
    const equipNames = itemIds
      .map((id) => {
        const eq = equipMap.get(id);
        return eq ? `${eq.name} (${eq.asset_code})` : '';
      })
      .filter(Boolean)
      .join('; ');

    return {
      'Mã đơn': b.booking_code,
      'Khách hàng': cust?.name || `Khách #${b.customer_id}`,
      'Số điện thoại khách': cust?.phone || '',
      'Thiết bị thuê': equipNames,
      'Trạng thái': b.status,
      'Thời gian nhận máy': formatDateTimeVN(b.start_at),
      'Thời gian trả dự kiến': formatDateTimeVN(b.end_at),
      'Tổng tiền thuê (VND)': b.total_rent,
      'Tiền cọc giữ lịch': b.deposit_holding_required || 0,
      'Tiền cọc thế chân': b.deposit_security_required || b.deposit_required || 0,
      'Cọc thế chân đã thu': b.deposit_security_received || b.deposit_received || 0,
      'Cọc thế chân đã hoàn': b.deposit_security_returned || b.deposit_returned || 0,
      'Phụ phí phát sinh': b.extra_fees || 0,
      'Giảm giá': b.discount || 0,
      'Ghi chú bàn giao': b.handover_notes || '',
      'Ghi chú khi trả': b.return_notes || '',
    };
  });

  // Sheet 4: So_Quy_Thu_Chi
  const transactionRows = transactions.map((tx) => ({
    'ID': tx.id,
    'Mã đơn liên quan': tx.booking_id || '',
    'Loại giao dịch': tx.type,
    'Số tiền (VND)': tx.amount,
    'Phương thức': tx.payment_method,
    'Thời gian': formatDateTimeVN(tx.date),
    'Nội dung': tx.note,
    'Là tiền cọc': tx.is_deposit ? 'Cọc giữ/thế chân (Không tính doanh thu)' : 'Doanh thu / Chi phí',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(equipmentRows), 'Kho_Thiet_Bi');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customerRows), 'Khach_Hang');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookingRows), 'Don_Thue');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transactionRows), 'So_Quy');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `CineRent_Data_${dateStr}.xlsx`;

  XLSX.writeFile(wb, filename);

  const nowIso = now.toISOString();
  await db.system_meta.put({
    key: 'last_backup_at',
    value: nowIso,
    updated_at: nowIso,
  });
}

/**
 * Imports from JSON file
 */
export async function importDatabaseFromJSON(jsonText: string, mode: 'overwrite' | 'merge' = 'overwrite'): Promise<{ success: boolean; message: string }> {
  try {
    const data: BackupPayload = JSON.parse(jsonText);
    if (!data.equipment && !data.customers && !data.bookings) {
      throw new Error('File JSON không chứa dữ liệu CineRent hợp lệ.');
    }

    if (mode === 'overwrite') {
      await db.transaction('rw', [db.categories, db.equipment, db.customers, db.bookings, db.booking_items, db.transactions], async () => {
        await db.categories.clear();
        await db.equipment.clear();
        await db.customers.clear();
        await db.bookings.clear();
        await db.booking_items.clear();
        await db.transactions.clear();

        if (data.categories?.length) await db.categories.bulkAdd(data.categories);
        if (data.equipment?.length) await db.equipment.bulkAdd(data.equipment);
        if (data.customers?.length) await db.customers.bulkAdd(data.customers);
        if (data.bookings?.length) await db.bookings.bulkAdd(data.bookings);
        if (data.booking_items?.length) await db.booking_items.bulkAdd(data.booking_items);
        if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
      });
    } else {
      // Merge
      if (data.equipment?.length) {
        for (const eq of data.equipment) {
          const existing = await db.equipment.where('asset_code').equals(eq.asset_code).first();
          if (existing) {
            await db.equipment.update(existing.id!, eq as any);
          } else {
            const { id: _, ...rest } = eq;
            await db.equipment.add(rest as Equipment);
          }
        }
      }
      if (data.customers?.length) {
        for (const c of data.customers) {
          const { id: _, ...rest } = c;
          await db.customers.add(rest as Customer);
        }
      }
    }

    const nowIso = new Date().toISOString();
    await db.system_meta.put({
      key: 'last_backup_at',
      value: nowIso,
      updated_at: nowIso,
    });

    return { success: true, message: 'Nhập dữ liệu JSON thành công! Dữ liệu đã đồng bộ.' };
  } catch (err: any) {
    return { success: false, message: `Lỗi nhập JSON: ${err?.message || 'Không thể đọc file'}` };
  }
}

/**
 * Imports from Excel or CSV file with full support for user's schema:
 * id, tenMay, loai, serial, hinhAnh, trangThai, gia6h, gia1Ngay, gia2Ngay, cocTheChanMacDinh, giuCCCDMacDinh, ghiChu, createdAt, updatedAt
 */
export async function importDatabaseFromExcel(buffer: ArrayBuffer): Promise<{ success: boolean; message: string }> {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    let importedEquipCount = 0;
    let importedCustCount = 0;
    let importedBookingCount = 0;
    let importedTxCount = 0;

    // Helper to check row columns
    const hasAnyProp = (row: any, props: string[]) => {
      const keys = Object.keys(row).map((k) => k.toLowerCase().trim());
      return props.some((p) => keys.some((k) => k.includes(p.toLowerCase())));
    };

    // Ensure default categories exist
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd([
        { id: 1, name: 'Máy ảnh', slug: 'camera' },
        { id: 2, name: 'Ống kính (Lens)', slug: 'lens' },
        { id: 3, name: 'Chống rung (Gimbal)', slug: 'gimbal' },
        { id: 4, name: 'Phụ kiện & Pin', slug: 'accessories' },
      ]);
    }

    // Classify sheets
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      if (!rows || rows.length === 0) continue;

      const firstRow = rows[0];
      const isBookingSheet =
        sheetName.toLowerCase().includes('don_thue') ||
        sheetName.toLowerCase().includes('donthue') ||
        sheetName.toLowerCase().includes('booking') ||
        sheetName.toLowerCase().includes('order') ||
        sheetName.toLowerCase().includes('lich') ||
        hasAnyProp(firstRow, ['thời gian nhận', 'thời gian trả', 'ngày nhận', 'ngày trả', 'mã đơn', 'booking_code', 'ngày thuê']);

      const isCustomerSheet =
        !isBookingSheet &&
        (sheetName.toLowerCase().includes('khach_hang') ||
          sheetName.toLowerCase().includes('customer') ||
          hasAnyProp(firstRow, ['cccd', 'cmnd', 'tên khách hàng', 'số điện thoại']));

      const isTxSheet =
        !isBookingSheet &&
        (sheetName.toLowerCase().includes('so_quy') ||
          sheetName.toLowerCase().includes('thu_chi') ||
          sheetName.toLowerCase().includes('transaction') ||
          hasAnyProp(firstRow, ['loại giao dịch', 'sổ quỹ', 'bút toán']));

      const isEquipSheet =
        !isBookingSheet &&
        !isCustomerSheet &&
        !isTxSheet;

      // 1. Process Customer Sheet
      if (isCustomerSheet) {
        for (const r of rows) {
          const name = String(r['Tên khách hàng'] || r['Họ và tên'] || r['name'] || '').trim();
          if (!name) continue;

          const custData: Partial<Customer> = {
            name,
            phone: String(r['Số điện thoại'] || r['phone'] || ''),
            identity_card: String(r['CCCD/CMND'] || r['identity_card'] || ''),
            email: String(r['Email'] || r['email'] || ''),
            address: String(r['Địa chỉ'] || r['address'] || ''),
            trust_level: 'normal',
            notes: String(r['Ghi chú'] || ''),
            created_at: new Date().toISOString(),
          };
          await db.customers.add(custData as Customer);
          importedCustCount++;
        }
      }

      // 2. Process Equipment Sheet
      if (isEquipSheet) {
        for (const r of rows) {
          const assetCode = String(r['id'] || r['Mã tài sản'] || r['asset_code'] || '').trim();
          const name = String(r['tenMay'] || r['Tên thiết bị'] || r['name'] || '').trim();

          if (!assetCode && !name) continue;

          const effectiveCode = assetCode || `MAY-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
          const effectiveName = name || assetCode;

          const rawStatus = String(r['trangThai'] || r['Trạng thái'] || r['status'] || '').toUpperCase();
          let status: any = 'available';
          if (rawStatus.includes('DANG_THUE') || rawStatus.includes('RENTED') || rawStatus.includes('THUÊ')) {
            status = 'rented';
          } else if (rawStatus.includes('BAO_DUONG') || rawStatus.includes('MAINTENANCE')) {
            status = 'maintenance';
          }

          let createdAtIso = new Date().toISOString();
          const rawCreated = r['createdAt'] || r['Ngày tạo'] || r['created_at'];
          if (rawCreated) {
            const parsed = parseVNDateTime(String(rawCreated));
            if (parsed) {
              createdAtIso = parsed.toISOString();
            } else {
              createdAtIso = toNormalizedISOString(normalizeExcelDate(rawCreated));
            }
          }

          const parseNum = (val: any, defaultVal: number) => {
            if (val === undefined || val === null || val === '') return defaultVal;
            const n = Number(val);
            return isNaN(n) ? defaultVal : n;
          };

          const rawDaily = r['gia1Ngay'] ?? r['Giá thuê/ngày (VND)'] ?? r['daily_rate'];
          const dailyRate = parseNum(rawDaily, 0);
          const raw6h = r['gia6h'] ?? r['rate_6h'];
          const rate6h = parseNum(raw6h, 0);
          const raw2days = r['gia2Ngay'] ?? r['rate_2days'];
          const rate2days = parseNum(raw2days, 0);
          const rawDeposit = r['cocTheChanMacDinh'] ?? r['Giá trị cọc đề xuất (VND)'] ?? r['deposit_rate'];
          const depositRate = parseNum(rawDeposit, 0);
          const keepCCCD = String(r['giuCCCDMacDinh'] || '').toUpperCase() === 'TRUE' || Boolean(r['keep_cccd']);

          const existing = await db.equipment.where('asset_code').equals(effectiveCode).first();

          const eqData: Partial<Equipment> = {
            asset_code: effectiveCode,
            name: effectiveName,
            category_id: 1,
            brand: String(r['loai'] || r['brand'] || 'Canon'),
            model: String(r['model'] || ''),
            serial_number: String(r['serial'] || r['serial_number'] || ''),
            daily_rate: dailyRate,
            rate_6h: rate6h,
            rate_2days: rate2days,
            deposit_rate: depositRate,
            keep_cccd: keepCCCD,
            status: status,
            condition: 'good',
            image_url: String(r['hinhAnh'] || r['image_url'] || ''),
            accessories: r['phuKienKemTheo']
              ? String(r['phuKienKemTheo']).split(';').map((s) => s.trim())
              : ['1x Pin', '1x Củ sạc', '1x Dây đeo'],
            notes: String(r['ghiChu'] || r['notes'] || ''),
            created_at: createdAtIso,
          };

          if (existing) {
            await db.equipment.update(existing.id!, eqData);
          } else {
            await db.equipment.add(eqData as Equipment);
          }
          importedEquipCount++;
        }
      }

      // 3. Process Booking Sheet (Creates both Bookings & linked Equipment/Customers if missing!)
      if (isBookingSheet) {
        const allEquip = await db.equipment.toArray();
        const allCust = await db.customers.toArray();

        for (const r of rows) {
          const bCode = String(
            r['Mã đơn'] || r['booking_code'] || r['id'] || `BK-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
          ).trim();

          const custName = String(
            r['Khách hàng'] || r['Tên khách hàng'] || r['customer'] || r['customer_name'] || r['Người thuê'] || 'Khách vãng lai'
          ).trim();
          const custPhone = String(r['Số điện thoại khách'] || r['Số điện thoại'] || r['phone'] || '').trim();

          // Match or create customer
          let matchedCust = allCust.find(
            (c) => c.name.toLowerCase() === custName.toLowerCase() || (custPhone && c.phone === custPhone)
          );
          if (!matchedCust) {
            const newId = await db.customers.add({
              name: custName,
              phone: custPhone,
              trust_level: 'normal',
              created_at: new Date().toISOString(),
            });
            matchedCust = {
              id: newId as number,
              name: custName,
              phone: custPhone,
              trust_level: 'normal',
              created_at: new Date().toISOString(),
            };
            allCust.push(matchedCust);
            importedCustCount++;
          }
          const customerId = matchedCust.id!;

          // Parse start and end dates
          const rawStart = r['Thời gian nhận máy'] || r['start_at'] || r['Từ ngày'] || r['Ngày nhận'] || r['Ngày thuê'];
          const rawEnd = r['Thời gian trả dự kiến'] || r['end_at'] || r['Đến ngày'] || r['Ngày trả'];

          let startIso = new Date().toISOString();
          let endIso = new Date(Date.now() + 86400000).toISOString();

          if (rawStart) {
            const parsed = parseVNDateTime(String(rawStart));
            if (parsed && !isNaN(parsed.getTime())) {
              startIso = parsed.toISOString();
            } else {
              startIso = toNormalizedISOString(normalizeExcelDate(rawStart));
            }
          }

          if (rawEnd) {
            const parsed = parseVNDateTime(String(rawEnd));
            if (parsed && !isNaN(parsed.getTime())) {
              endIso = parsed.toISOString();
            } else {
              endIso = toNormalizedISOString(normalizeExcelDate(rawEnd));
            }
          }

          // Parse status
          const rawStatus = String(r['Trạng thái'] || r['status'] || '').toLowerCase();
          let status: any = 'confirmed';
          if (rawStatus.includes('active') || rawStatus.includes('dang_thue') || rawStatus.includes('đang thuê')) {
            status = 'active';
          } else if (rawStatus.includes('returned') || rawStatus.includes('da_tra') || rawStatus.includes('đã trả')) {
            status = 'returned';
          } else if (rawStatus.includes('cancelled') || rawStatus.includes('da_huy') || rawStatus.includes('đã hủy')) {
            status = 'cancelled';
          }

          const totalRent = Number(r['Tổng tiền thuê (VND)'] || r['total_rent'] || r['Tiền thuê'] || 0);
          const depHolding = Number(r['Tiền cọc giữ lịch'] || r['deposit_holding_required'] || 0);
          const depSec = Number(r['Tiền cọc thế chân'] || r['deposit_security_required'] || r['deposit_required'] || 0);
          const depSecRec = Number(r['Cọc thế chân đã thu'] || r['deposit_security_received'] || 0);
          const depSecRet = Number(r['Cọc thế chân đã hoàn'] || r['deposit_security_returned'] || 0);

          const bookingData: Partial<Booking> = {
            booking_code: bCode,
            customer_id: customerId,
            status,
            start_at: startIso,
            end_at: endIso,
            total_rent: totalRent,
            deposit_holding_required: depHolding,
            deposit_holding_received: depHolding > 0 ? depHolding : 0,
            deposit_holding_returned: 0,
            deposit_security_required: depSec,
            deposit_security_received: depSecRec,
            deposit_security_returned: depSecRet,
            deposit_required: depSec,
            deposit_received: depSecRec,
            deposit_returned: depSecRet,
            extra_fees: Number(r['Phụ phí phát sinh'] || r['extra_fees'] || 0),
            discount: Number(r['Giảm giá'] || r['discount'] || 0),
            handover_notes: String(r['Ghi chú bàn giao'] || r['handover_notes'] || ''),
            return_notes: String(r['Ghi chú khi trả'] || r['return_notes'] || ''),
            created_at: new Date().toISOString(),
          };

          const existingBooking = await db.bookings.where('booking_code').equals(bCode).first();
          let bookingId: number;
          if (existingBooking) {
            await db.bookings.update(existingBooking.id!, bookingData);
            bookingId = existingBooking.id!;
          } else {
            bookingId = (await db.bookings.add(bookingData as Booking)) as number;
          }

          // Match or auto-create equipment items from the booking row
          const rawEquip = String(
            r['Thiết bị thuê'] || r['tenMay'] || r['Tên máy'] || r['Mã máy'] || r['equipment'] || r['Thiết bị'] || ''
          );
          if (rawEquip) {
            const equipTokens = rawEquip.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
            for (const token of equipTokens) {
              const lowerToken = token.toLowerCase();
              let matchedEq = allEquip.find(
                (e) =>
                  lowerToken.includes(e.asset_code.toLowerCase()) ||
                  lowerToken.includes(e.name.toLowerCase()) ||
                  e.name.toLowerCase().includes(lowerToken)
              );

              // Auto-create equipment if missing
              if (!matchedEq) {
                const newCode = `MAY-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
                const newEqId = await db.equipment.add({
                  asset_code: newCode,
                  name: token,
                  category_id: 1,
                  brand: 'Canon',
                  model: token,
                  serial_number: '',
                  daily_rate: totalRent > 0 ? totalRent : 150000,
                  rate_6h: 100000,
                  rate_2days: 250000,
                  deposit_rate: depSec > 0 ? depSec : 500000,
                  keep_cccd: true,
                  status: status === 'active' ? 'rented' : 'available',
                  condition: 'good',
                  accessories: ['1x Pin', '1x Củ sạc', '1x Dây đeo'],
                  created_at: new Date().toISOString(),
                });
                matchedEq = {
                  id: newEqId as number,
                  asset_code: newCode,
                  name: token,
                  category_id: 1,
                  daily_rate: totalRent > 0 ? totalRent : 150000,
                  status: status === 'active' ? 'rented' : 'available',
                } as any;
                allEquip.push(matchedEq!);
                importedEquipCount++;
              }

              if (matchedEq?.id) {
                const existingItem = await db.booking_items
                  .where('booking_id')
                  .equals(bookingId)
                  .and((item) => item.equipment_id === matchedEq!.id)
                  .first();

                if (!existingItem) {
                  await db.booking_items.add({
                    booking_id: bookingId,
                    equipment_id: matchedEq.id,
                    rental_price: matchedEq.daily_rate ?? 0,
                    accessories_checklist: [],
                  });
                }

                if (status === 'active') {
                  await db.equipment.update(matchedEq.id, { status: 'rented' });
                }
              }
            }
          }

          importedBookingCount++;
        }
      }

      // 4. Process Transaction Sheet
      if (isTxSheet) {
        for (const r of rows) {
          const amount = Number(r['Số tiền (VND)'] || r['amount'] || 0);
          if (amount <= 0) continue;

          const rawDate = r['Thời gian'] || r['date'];
          let dateIso = new Date().toISOString();
          if (rawDate) {
            const parsed = parseVNDateTime(String(rawDate));
            if (parsed && !isNaN(parsed.getTime())) {
              dateIso = parsed.toISOString();
            } else {
              dateIso = toNormalizedISOString(normalizeExcelDate(rawDate));
            }
          }

          await db.transactions.add({
            type: (r['Loại giao dịch'] || r['type'] || 'income_rent') as any,
            amount,
            payment_method: (r['Phương thức'] || r['payment_method'] || 'transfer') as any,
            date: dateIso,
            note: String(r['Nội dung'] || r['note'] || 'Giao dịch từ Excel'),
            is_deposit: String(r['Là tiền cọc'] || '').includes('Cọc'),
          });
          importedTxCount++;
        }
      }
    }

    // Remove wiped_clean flag now that fresh data was imported
    await db.system_meta.delete('wiped_clean');

    const nowIso = new Date().toISOString();
    await db.system_meta.put({
      key: 'last_backup_at',
      value: nowIso,
      updated_at: nowIso,
    });

    const summaryParts: string[] = [];
    if (importedEquipCount > 0) summaryParts.push(`${importedEquipCount} thiết bị`);
    if (importedCustCount > 0) summaryParts.push(`${importedCustCount} khách hàng`);
    if (importedBookingCount > 0) summaryParts.push(`${importedBookingCount} đơn thuê máy`);
    if (importedTxCount > 0) summaryParts.push(`${importedTxCount} bút toán sổ quỹ`);

    const finalSummary = summaryParts.length > 0 ? summaryParts.join(', ') : 'Dữ liệu đã được nạp';

    return {
      success: true,
      message: `Đã nạp thành công từ file Excel: ${finalSummary}! Dữ liệu đã lưu an toàn vào IndexedDB.`,
    };
  } catch (err: any) {
    return { success: false, message: `Lỗi đọc file Excel/CSV: ${err?.message || 'Không thể xử lý dữ liệu'}` };
  }
}
