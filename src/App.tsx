/**
 * CineRent - Ứng dụng Quản lý Cho thuê Thiết bị Quay Chụp (Offline PWA 2.0)
 * Giao diện Sáng (Light Theme) • Zero-Backend • IndexedDB Local Storage
 * Chủ cơ sở: Châu Nguyễn Phương Thanh (0353507296 - TP. Hồ Chí Minh)
 */

import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  LayoutDashboard,
  Camera,
  Calendar,
  Users,
  TrendingUp,
  Database,
  PlusCircle,
  Menu,
  X,
  Layers,
} from 'lucide-react';
import { db } from './db/db.ts';
import { initializeDatabaseIfEmpty } from './db/seedData.ts';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { EquipmentView } from './components/equipment/EquipmentView.tsx';
import { BookingsView } from './components/bookings/BookingsView.tsx';
import { CustomersView } from './components/customers/CustomersView.tsx';
import { FinanceView } from './components/finance/FinanceView.tsx';
import { BackupView } from './components/backup/BackupView.tsx';
import { BookingModal } from './components/bookings/BookingModal.tsx';
import { EquipmentModal } from './components/equipment/EquipmentModal.tsx';
import { BookingDetailModal } from './components/bookings/BookingDetailModal.tsx';
import { PWAInstallButton } from './components/common/PWAInstallButton.tsx';
import { OfflineIndicator } from './components/common/OfflineIndicator.tsx';
import { BackupAlertBanner } from './components/common/BackupAlertBanner.tsx';
import { useBackupReminder } from './hooks/useBackupReminder.ts';
import { STORE_OWNER } from './utils/formatters.ts';

export type NavTab = 'dashboard' | 'equipment' | 'bookings' | 'customers' | 'finance' | 'backup';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Quick Modals
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [preselectedEquipmentId, setPreselectedEquipmentId] = useState<number | undefined>(undefined);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  // Backup status
  const { daysSinceBackup, shouldAlert, refreshBackupStatus } = useBackupReminder();

  // Badges counts
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const activeBookingsCount = useLiveQuery(() => db.bookings.where('status').equals('active').count()) || 0;

  useEffect(() => {
    initializeDatabaseIfEmpty().then(() => {
      refreshBackupStatus();
    });
  }, []);

  const handleOpenNewBooking = (equipId?: number) => {
    setPreselectedEquipmentId(equipId);
    setIsBookingModalOpen(true);
  };

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number | string;
    alert?: boolean;
  }[] = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'equipment', label: 'Kho máy', icon: Camera },
    { id: 'bookings', label: 'Lịch thuê', icon: Calendar, badge: activeBookingsCount > 0 ? activeBookingsCount : undefined },
    { id: 'customers', label: 'Khách hàng', icon: Users },
    { id: 'finance', label: 'Sổ quỹ', icon: TrendingUp },
    { id: 'backup', label: 'Sao lưu', icon: Database, alert: shouldAlert },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans pb-20 md:pb-6 antialiased selection:bg-cyan-600 selection:text-white">
      {/* 1. Backup Alert Banner */}
      {shouldAlert && (
        <BackupAlertBanner
          daysSinceBackup={daysSinceBackup}
          onNavigateToBackup={() => setActiveTab('backup')}
        />
      )}

      {/* 2. Top Header Bar (Light Theme) */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          {/* Brand Logo */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer select-none"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 shadow-sm text-white">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-black text-lg text-slate-900 tracking-tight">CineRent</span>
                <span className="rounded bg-cyan-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-cyan-800 border border-cyan-200">
                  OFFLINE 2.0
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                {STORE_OWNER.name} • SĐT: {STORE_OWNER.phone}
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Điều hướng chính">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition relative ${
                    isActive
                      ? 'bg-cyan-50 text-cyan-800 border border-cyan-200 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-black text-black">
                      {item.badge}
                    </span>
                  )}
                  {item.alert && (
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2">
            <OfflineIndicator />
            <PWAInstallButton />

            <button
              onClick={() => handleOpenNewBooking()}
              className="hidden sm:flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-95 transition"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Tạo đơn</span>
            </button>

            {/* Mobile burger toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              aria-label="Mở menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 border-t border-slate-200 pt-3 pb-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold ${
                    isActive ? 'bg-cyan-50 text-cyan-800 border border-cyan-200' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-cyan-600" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-black">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* 3. Main Body Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-4 py-4 sm:py-6 pb-24 md:pb-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenNewBooking={() => handleOpenNewBooking()}
            onOpenNewEquipment={() => setIsEquipmentModalOpen(true)}
            onSelectBooking={(id) => setSelectedBookingId(id)}
          />
        )}

        {activeTab === 'equipment' && (
          <EquipmentView
            onOpenNewBookingWithEquipment={(eqId) => handleOpenNewBooking(eqId)}
          />
        )}

        {activeTab === 'bookings' && (
          <BookingsView
            initialSelectedBookingId={selectedBookingId}
            onClearSelectedBooking={() => setSelectedBookingId(null)}
          />
        )}

        {activeTab === 'customers' && <CustomersView />}

        {activeTab === 'finance' && <FinanceView />}

        {activeTab === 'backup' && <BackupView />}
      </main>

      {/* 4. Mobile Bottom Navigation Bar (Light Theme) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-1.5 md:hidden shadow-lg"
        aria-label="Thanh điều hướng dưới"
      >
        <div className="grid grid-cols-6 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center py-1 rounded-xl transition relative ${
                  isActive
                    ? 'text-cyan-700 font-black bg-cyan-50'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge !== undefined && (
                    <span className="absolute -top-1 -right-2 rounded-full bg-amber-500 px-1 text-[8px] font-black text-black">
                      {item.badge}
                    </span>
                  )}
                  {item.alert && (
                    <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 truncate max-w-full font-semibold">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 5. Global Booking Creation Modal */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          setPreselectedEquipmentId(undefined);
        }}
        preselectedEquipmentId={preselectedEquipmentId}
        onSaved={() => {
          setActiveTab('bookings');
        }}
      />

      {/* 6. Global Equipment Creation Modal */}
      <EquipmentModal
        isOpen={isEquipmentModalOpen}
        onClose={() => setIsEquipmentModalOpen(false)}
        categories={categories}
        onSaved={() => {
          setActiveTab('equipment');
        }}
      />

      {/* 7. Global Booking Detail Modal */}
      <BookingDetailModal
        isOpen={!!selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        bookingId={selectedBookingId}
        onEdit={(b) => {
          setSelectedBookingId(null);
          setIsBookingModalOpen(true);
        }}
      />
    </div>
  );
}
