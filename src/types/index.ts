export type EquipmentStatus = 'available' | 'rented' | 'maintenance' | 'retired';
export type EquipmentCondition = 'new' | 'good' | 'fair';

export interface Category {
  id?: number;
  name: string;
  slug: string;
}

export interface Equipment {
  id?: number;
  asset_code: string; // e.g. MAY-20260816-203659-870
  name: string;       // e.g. [Trắng] Canon R50
  category_id: number;
  brand: string;
  model: string;
  serial_number: string;
  daily_rate: number;      // gia1Ngay
  rate_6h?: number;        // gia6h
  rate_2days?: number;     // gia2Ngay
  deposit_rate: number;    // cocTheChanMacDinh
  keep_cccd?: boolean;     // giuCCCDMacDinh
  status: EquipmentStatus; // HOAT_DONG -> available
  condition: EquipmentCondition;
  accessories: string[];
  photo_base64?: string;
  image_url?: string;      // hinhAnh link
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export type CustomerTrustLevel = 'vip' | 'verified' | 'normal' | 'blacklisted';

export interface Customer {
  id?: number;
  name: string; // Tên là điều kiện BẮT BUỘC duy nhất
  phone?: string;
  email?: string;
  identity_card?: string; // CCCD/CMND
  address?: string;
  facebook_zalo?: string;
  trust_level: CustomerTrustLevel;
  id_card_photos?: string[];
  notes?: string;
  created_at: string;
}

export type BookingStatus = 'draft' | 'confirmed' | 'active' | 'returned' | 'cancelled';

export interface Booking {
  id?: number;
  booking_code: string;
  customer_id: number;
  status: BookingStatus;
  start_at: string; // ISO string 2026-10-17T08:00:00
  end_at: string;   // ISO string 2026-10-18T18:00:00
  
  // Tiền thuê linh động
  total_rent: number;          // Tiền thuê chốt cuối cùng
  is_custom_rent?: boolean;    // Có nhập số tiền thuê tùy chỉnh hay không
  calculated_rent?: number;    // Tiền thuê theo công thức tự động

  // 1. Tiền cọc giữ lịch (Cọc để giữ chỗ máy - hoàn lại hoặc cấn trừ khi khách nhận máy)
  deposit_holding_required: number;
  deposit_holding_received: number;
  deposit_holding_returned: number;

  // 2. Tiền cọc thế chân (Cọc bảo lãnh tài sản - hoàn lại khi trả máy nguyên vẹn)
  deposit_security_required: number;
  deposit_security_received: number;
  deposit_security_returned: number;

  // Tương thích ngược
  deposit_required: number;
  deposit_received: number;
  deposit_returned: number;

  discount: number;
  extra_fees: number;
  actual_return_at?: string | null;
  handover_notes?: string;
  return_notes?: string;
  created_at: string;
}

export interface BookingItemAccessoryCheck {
  name: string;
  checked_out: boolean;
  checked_in: boolean;
}

export interface BookingItem {
  id?: number;
  booking_id: number;
  equipment_id: number;
  rental_price: number;
  condition_on_out?: string;
  condition_on_in?: string;
  accessories_checklist: BookingItemAccessoryCheck[];
}

export type TransactionType =
  | 'income_rent'               // Tiền thuê thu khi nhận máy
  | 'deposit_holding_in'        // Thu cọc giữ lịch
  | 'deposit_holding_refund'    // Hoàn cọc giữ lịch khi giao máy
  | 'deposit_security_in'       // Thu cọc thế chân khi giao máy
  | 'deposit_security_refund'   // Hoàn cọc thế chân khi trả máy
  | 'deposit_in'                // (legacy)
  | 'deposit_refund'            // (legacy)
  | 'expense'                   // Chi phí vận hành
  | 'other_income';             // Thu khác

export type PaymentMethod = 'cash' | 'transfer' | 'card';

export interface Transaction {
  id?: number;
  booking_id?: number;
  type: TransactionType;
  amount: number;
  payment_method: PaymentMethod;
  date: string;
  note: string;
  is_deposit: boolean; // Tiền cọc không tính vào doanh thu
}

export interface SystemMeta {
  key: string;
  value: any;
  updated_at: string;
}
