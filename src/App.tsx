import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { PetPage } from '@/app/pet/PetPage';
import { DiaryPage } from '@/app/diary/DiaryPage';
import { LibraryPage } from '@/app/library/LibraryPage';
import { ProgressPage } from '@/app/progress/ProgressPage';
import { SettingsPage } from '@/app/settings/SettingsPage';
import { MealEditor } from '@/features/meals/MealEditor';
import { FitbitCallback } from '@/app/auth/FitbitCallback';
import { useThemeEffect } from '@/features/settings/useThemeEffect';
import { OnboardingGate } from '@/features/onboarding/OnboardingWizard';
import { InstallPrompt } from '@/features/install-prompt/InstallPrompt';
import { Toaster } from '@/components/ui/Toaster';

export default function App() {
  useThemeEffect();
  return (
    <>
      <Routes>
        {/* Fullscreen routes (no bottom nav). */}
        <Route path="/auth/fitbit/callback" element={<FitbitCallback />} />
        <Route path="/meals/new" element={<MealEditor mode="create" />} />
        <Route path="/meals/:id/edit" element={<MealEditor mode="edit" />} />
        <Route path="/pet" element={<PetPage />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/diary" replace />} />
          <Route path="/diary" element={<DiaryPage />} />
          <Route path="/diary/:date" element={<DiaryPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/meals" element={<Navigate to="/library" replace />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/diary" replace />} />
        </Route>
      </Routes>
      <OnboardingGate />
      <InstallPrompt />
      <Toaster />
    </>
  );
}
