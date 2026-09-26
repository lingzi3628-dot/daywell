import Link from "next/link";
import "../legal.css";

const whatsapp = "https://wa.me/254798081280?text=Daywell%20support%20request";

export const metadata = { title: "Terms of Service | Daywell", description: "Terms for using the Daywell website and mobile app." };

export default function TermsPage() {
  return <main className="legal-page"><div className="legal-wrap"><Link className="legal-brand" href="/">daywell<span>.</span></Link><article className="legal-card"><p className="legal-updated">Effective date: 26 September 2026</p><h1>Terms of Service</h1><p>These terms apply to your use of Daywell, operated by Baby Seven. By creating an account or using the service, you agree to these terms. If you do not agree, do not use Daywell.</p>
    <h2>Using Daywell</h2><p>Daywell provides tools for goals, tasks, reminders, focus sessions, check-ins, writing and AI assistance. You must provide accurate account information, keep your password and session access secure, and use the service lawfully. You are responsible for activity on your account and for maintaining copies of important content.</p>
    <h2>Your content and AI</h2><p>You retain your rights to the content you create or submit. You give Daywell permission to store, process and display that content only as needed to provide and secure the service. If you use AI, your prompts and relevant context are sent to the configured AI provider. AI output can be inaccurate, incomplete or unsuitable; review it before relying on or publishing it. AI features are not professional medical, legal, financial or emergency advice.</p>
    <h2>Provider connections</h2><p>You may connect your own AI provider by supplying an API key. You must have authority to use that key and comply with the provider’s terms, usage limits and charges. You are responsible for charges made by your chosen provider. Do not share keys you do not own or control.</p>
    <h2>Acceptable use</h2><p>You may not use Daywell to break the law, harm others, violate another person’s rights, interfere with the service, attempt unauthorized access, or transmit malicious code. We may limit or suspend access when reasonably necessary to protect users, the service or the law.</p>
    <h2>Availability and changes</h2><p>We work to keep Daywell available but do not promise uninterrupted or error-free service. Features may change, and we may suspend or discontinue parts of the service. We will use reasonable efforts to provide notice when a material change affects users.</p>
    <h2>Liability</h2><p>To the extent permitted by applicable law, Daywell is provided without a guarantee that it will meet every requirement or that AI output will be correct. Nothing in these terms excludes liability that cannot lawfully be excluded, including liability for fraud or for death or personal injury caused by negligence.</p>
    <h2>Privacy</h2><p>Our <Link href="/privacy">Privacy Policy</Link> explains how account and workspace information is handled. By using Daywell, you acknowledge that policy.</p>
    <h2>Law and contact</h2><p>These terms are governed by the laws of Kenya, subject to any mandatory consumer protections that apply to you. Contact Baby Seven with questions or support requests on <a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp at 0798 081 280</a>.</p>
    <div className="legal-actions"><Link href="/privacy">Privacy Policy</Link><Link href="/">Back to Daywell</Link></div></article></div></main>;
}
