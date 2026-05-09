import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DiaryPage } from '@/app/diary/DiaryPage';
import { MealsPage } from '@/app/meals/MealsPage';
import { ProgressPage } from '@/app/progress/ProgressPage';
import { SettingsPage } from '@/app/settings/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/diary" replace />} />
        <Route path="/diary" element={<DiaryPage />} />
        <Route path="/diary/:date" element={<DiaryPage />} />
        <Route path="/meals" element={<MealsPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/diary" replace />} />
      </Route>
    </Routes>
  );
}
