import { Link } from "react-router-dom";

type LanguageToggleProps = {
  to: string;
  label: string;
  langToSave: "en" | "ru";
};

export default function LanguageToggle({ to, label, langToSave }: LanguageToggleProps) {
  return (
    <Link
      to={to}
      className="control-btn"
      onClick={() => window.localStorage.setItem("preferred-language", langToSave)}
    >
      {label}
    </Link>
  );
}
