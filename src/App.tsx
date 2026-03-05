import { Navigate, Route, Routes } from "react-router-dom";
import LocalizedPage from "@/pages/LocalizedPage";
import { GlobalPlayerProvider } from "@/player/GlobalPlayerContext";

export default function App() {
  return (
    <GlobalPlayerProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/en" replace />} />
        <Route path="/:lang/*" element={<LocalizedPage />} />
        <Route path="*" element={<Navigate to="/en" replace />} />
      </Routes>
    </GlobalPlayerProvider>
  );
}
