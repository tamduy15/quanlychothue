import { format, parseISO, differenceInHours } from 'date-fns';
import type { Booking, Customer, Equipment } from '../types/index.ts';

export type RentalMessageKey =
  | 'depositReceived'
  | 'pickupReminder'
  | 'handedOver'
  | 'returnReminder'
  | 'completed';

export interface RentalMessagesResult {
  depositReceived: string;
  pickupReminder: string;
  handedOver: string;
  returnReminder: string;
  completed: string;
}

export interface MessageTypeMeta {
  key: RentalMessageKey;
  title: string;
  shortLabel: string;
  badgeColor: string;
  buttonBg: string;
  description: string;
}

export const RENTAL_MESSAGE_TYPES: MessageTypeMeta[] = [
  {
    key: 'depositReceived',
    title: '1. Xác nhận cọc / Giữ lịch',
    shortLabel: 'Copy xác nhận cọc',
    badgeColor: 'bg-sky-50 text-sky-800 border-sky-200',
    buttonBg: 'bg-sky-600 hover:bg-sky-700 text-white',
    description: 'Tự động nhận diện đã nhận cọc giữ lịch hay đang giữ lịch tạm chờ chuyển khoản.',
  },
  {
    key: 'pickupReminder',
    title: '2. Nhắc lịch nhận máy',
    shortLabel: 'Copy nhắc nhận máy',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    buttonBg: 'bg-amber-600 hover:bg-amber-700 text-white',
    description: 'Nhắc khách thời gian đến nhận máy, số tiền cọc thế chân và CCCD gốc + đối chiếu VNeID.',
  },
  {
    key: 'handedOver',
    title: '3. Đã bàn giao máy',
    shortLabel: 'Copy bàn giao máy',
    badgeColor: 'bg-blue-50 text-blue-800 border-blue-200',
    buttonBg: 'bg-blue-600 hover:bg-blue-700 text-white',
    description: 'Xác nhận đã giao máy cho khách, ghi nhận cọc thế chân và CCCD đã nhận.',
  },
  {
    key: 'returnReminder',
    title: '4. Nhắc lịch trả máy',
    shortLabel: 'Copy nhắc trả máy',
    badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    buttonBg: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    description: 'Nhắc khách giờ trả máy dự kiến để kiểm tra máy và hoàn lại cọc/CCCD.',
  },
  {
    key: 'completed',
    title: '5. Hoàn tất lịch thuê',
    shortLabel: 'Copy hoàn tất',
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    description: 'Xác nhận đã nhận lại máy, phụ phí phát sinh (nếu có) và cảm ơn khách hàng.',
  },
];

/**
 * Formats money exactly like Google Apps Script formatMoney_ (e.g. "2.000.000đ")
 */
export function formatMoneyGAS(value: number | undefined | null): string {
  const n = Number(value) || 0;
  return n.toLocaleString('vi-VN') + 'đ';
}

/**
 * Formats datetime exactly like Google Apps Script formatDateTime_ ("HH:mm, dd/MM/yyyy")
 */
export function formatDateTimeGAS(isoOrDate: string | Date | undefined | null): string {
  if (!isoOrDate) return '--';
  try {
    const d = typeof isoOrDate === 'string' ? parseISO(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return String(isoOrDate);
    return format(d, 'HH:mm, dd/MM/yyyy');
  } catch {
    return String(isoOrDate);
  }
}

/**
 * Formats period like Google Apps Script formatPeriod_ ("từ HH:mm, dd/MM/yyyy đến HH:mm, dd/MM/yyyy")
 */
export function formatPeriodGAS(startAt: string | Date, endAt: string | Date): string {
  return `từ ${formatDateTimeGAS(startAt)} đến ${formatDateTimeGAS(endAt)}`;
}

/**
 * Helper to check if holding deposit is considered received
 */
export function isHoldingDepositReceived(b: Booking): boolean {
  if (b.has_received_holding_deposit !== undefined) {
    return b.has_received_holding_deposit;
  }
  return (b.deposit_holding_received || 0) > 0;
}

/**
 * Helper to check if security deposit (cọc thế chân) is considered received
 */
export function isSecurityDepositReceived(b: Booking): boolean {
  if (b.has_received_security_deposit !== undefined) {
    return b.has_received_security_deposit;
  }
  return (b.deposit_security_received || b.deposit_received || 0) > 0 || b.status === 'active';
}

/**
 * Helper to check if keep CCCD is enabled for this booking (always true by default)
 */
export function isKeepCCCD(b: Booking, _equipmentList: Equipment[] = []): boolean {
  if (b.keep_cccd === false) {
    return false;
  }
  return true;
}

/**
 * Builds the 5 automated customer messages based on the user's Google Apps Script buildMessages_(r)
 * while supporting multi-equipment or single-equipment bookings seamlessly.
 */
export function buildRentalMessages(
  booking: Booking,
  equipmentList: Equipment[],
  customer?: Customer | null
): RentalMessagesResult {
  const machineName =
    equipmentList.length > 0
      ? equipmentList.map((e) => e.name).join(' + ')
      : booking.booking_code;

  const period = formatPeriodGAS(booking.start_at, booking.end_at);

  const cocGiuLich = booking.deposit_holding_required || booking.deposit_holding_received || 0;
  const daNhanCocGiuLich = isHoldingDepositReceived(booking);

  const cocTheChan =
    booking.deposit_security_required ||
    booking.deposit_security_received ||
    booking.deposit_required ||
    0;
  const daNhanCocTheChan = isSecurityDepositReceived(booking);

  const daNhanCCCD = Boolean(booking.has_received_cccd || booking.status === 'active');
  const daThanhToan = Boolean(booking.is_rent_paid || booking.status === 'active');
  const phuPhi = booking.extra_fees || 0;

  const collateralText = cocTheChan > 0 ? `${formatMoneyGAS(cocTheChan)} tiền cọc thế chân` : '';
  const rentText = booking.total_rent > 0 ? `${formatMoneyGAS(booking.total_rent)} tiền thuê` : '';
  const idText = 'CCCD bản cứng và đối chiếu VNeID';
  const prep = [collateralText, rentText, idText].filter(Boolean).join(', ');

  const depositReceived = daNhanCocGiuLich
    ? `Mình đã nhận ${formatMoneyGAS(booking.deposit_holding_received || cocGiuLich)} tiền cọc giữ lịch của bạn. Mình xác nhận lại lịch thuê ${machineName} ${period}. Khi nhận máy, bạn chuẩn bị giúp mình ${prep} nhé. Cảm ơn bạn!`
    : `Mình giữ lịch tạm ${machineName} ${period} cho bạn. Tiền cọc giữ lịch là ${formatMoneyGAS(
        cocGiuLich
      )}. Sau khi nhận cọc mình sẽ xác nhận lịch chính thức nhé. Cảm ơn bạn!`;

  const pickupReminder = `Mình nhắc lịch thuê ${machineName} của bạn ${period}. Khi đến nhận máy, bạn chuẩn bị giúp mình ${prep} nhé. Nếu có thay đổi thời gian nhận máy bạn báo mình sớm giúp mình. Cảm ơn bạn!`;

  const receivedParts: string[] = [];
  if (daNhanCocTheChan && cocTheChan > 0) {
    receivedParts.push(`${formatMoneyGAS(cocTheChan)} cọc thế chân`);
  }
  if (daThanhToan && booking.total_rent > 0) {
    receivedParts.push(`${formatMoneyGAS(booking.total_rent)} tiền thuê`);
  }
  if (daNhanCCCD) {
    receivedParts.push('CCCD bản cứng (đã đối chiếu VNeID)');
  }

  const handedOver = `Mình xác nhận đã bàn giao ${machineName} cho bạn theo lịch ${period}.${
    receivedParts.length > 0 ? ' Đã nhận: ' + receivedParts.join(' + ') + '.' : ''
  } Chúc bạn sử dụng máy vui vẻ và giữ máy cẩn thận giúp mình nhé!`;

  const returnReminder = `Mình nhắc bạn lịch trả ${machineName} vào ${formatDateTimeGAS(
    booking.end_at
  )}. Bạn giúp mình sắp xếp trả đúng giờ để mình kiểm tra máy và hoàn lại cọc/CCCD nhé. Nếu có phát sinh trễ giờ, bạn báo mình sớm giúp mình.`;

  const completed = `Mình xác nhận đã nhận lại ${machineName} và hoàn tất lịch thuê ${period}.${
    phuPhi > 0 ? ' Phụ phí phát sinh: ' + formatMoneyGAS(phuPhi) + '.' : ''
  } Cảm ơn bạn đã thuê máy nhé. Hẹn bạn ở lần thuê tiếp theo!`;

  return {
    depositReceived,
    pickupReminder,
    handedOver,
    returnReminder,
    completed,
  };
}

/**
 * Intelligently recommends which message is most appropriate to send right now
 */
export function getRecommendedMessageType(booking: Booking): {
  key: RentalMessageKey;
  reason: string;
} {
  const now = new Date();
  const start = parseISO(booking.start_at);
  const end = parseISO(booking.end_at);

  if (booking.status === 'returned') {
    return { key: 'completed', reason: 'Đơn đã trả máy hoàn tất' };
  }

  if (booking.status === 'active') {
    const hoursToReturn = differenceInHours(end, now);
    if (hoursToReturn <= 12) {
      return { key: 'returnReminder', reason: 'Sắp đến giờ trả máy' };
    }
    return { key: 'handedOver', reason: 'Vừa bàn giao máy cho khách' };
  }

  // Confirmed / Draft
  const daNhanCoc = isHoldingDepositReceived(booking);
  if (!daNhanCoc && (booking.deposit_holding_required || 0) > 0) {
    return { key: 'depositReceived', reason: 'Giữ lịch tạm • Chờ khách cọc' };
  }

  const hoursToPickup = differenceInHours(start, now);
  if (hoursToPickup >= -2 && hoursToPickup <= 24) {
    return { key: 'pickupReminder', reason: 'Sắp đến giờ nhận máy (trong 24h)' };
  }

  return { key: 'depositReceived', reason: 'Đã nhận cọc giữ lịch' };
}

/**
 * Global toast dispatcher & clipboard copy utility
 */
export async function copyTextWithToast(text: string, toastMessage = 'Đã copy tin nhắn vào bộ nhớ tạm!'): Promise<boolean> {
  let copied = false;
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      copied = true;
    } catch {
      copied = false;
    }
  }

  window.dispatchEvent(
    new CustomEvent('cinerent-toast', {
      detail: { message: toastMessage },
    })
  );

  return copied;
}
