import { ArrowLeft } from "lucide-react";
import styles from "./back-link.module.css";

export function PortalBackLink({ href, label }: { href: string; label: string }) {
  return <a className={styles.link} href={href}><ArrowLeft size={18} aria-hidden="true" />{label}</a>;
}
