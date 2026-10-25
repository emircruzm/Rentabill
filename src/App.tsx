import React from 'react';
import { InventoryProvider, useInventory } from '@application/index';
import {
  Header,
  BottomNavigation,
  ToastNotification,
  CalibrationModal,
  LogoutConfirmModal,
  ProfileModal,
  InviteTeamModal,
  InvitationConfirmModal,
  HelpTutorialModal,
  RoleTestBanner,
  PulsoView,
  InventarioView,
  POSView,
  RestockSimulatorView,
  ProductRegisterView,
  HistorialView,
  AjustesView,
  AuthView,
  OnboardingView,
  ConnectionErrorView
} from '@presentation/index';

const MainContent: React.FC = () => {
  const { activeTab } = useInventory();

  return (
    <main className="min-h-screen bg-slate-50">
      {activeTab === 'pulso' && <PulsoView />}
      {activeTab === 'inventario' && <InventarioView />}
      {activeTab === 'vender' && <POSView />}
      {activeTab === 'historial' && <HistorialView />}
      {activeTab === 'simulador' && <RestockSimulatorView />}
      {activeTab === 'nuevo-producto' && <ProductRegisterView />}
      {activeTab === 'ajustes' && <AjustesView />}
    </main>
  );
};

const AppContent: React.FC = () => {
  const { authScreen, settings } = useInventory();

  if (authScreen === 'login') {
    return <AuthView initialMode="login" />;
  }

  if (authScreen === 'register') {
    return <AuthView initialMode="register" />;
  }

  if (authScreen === 'onboarding') {
    return <OnboardingView />;
  }

  if (authScreen === 'error') {
    return <ConnectionErrorView />;
  }

  return (
    <div className={`min-h-screen ${settings.darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-100'} flex justify-center`}>
      {/* Mobile-first framed container */}
      <div className={`w-full max-w-md ${settings.darkMode ? 'bg-slate-900' : 'bg-slate-50'} min-h-screen flex flex-col shadow-2xl relative`}>
        {/* Unified sticky top bar (Header + Role Test Banner) */}
        <div className="sticky top-0 z-40 w-full">
          <Header />
          <RoleTestBanner />
        </div>
        <MainContent />
        <BottomNavigation />
        <ToastNotification />
        <CalibrationModal />
        <LogoutConfirmModal />
        <ProfileModal />
        <InviteTeamModal />
        <InvitationConfirmModal />
        <HelpTutorialModal />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <InventoryProvider>
      <AppContent />
    </InventoryProvider>
  );
}
