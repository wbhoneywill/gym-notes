'use client';

import { useEffect, useState } from 'react';

export default function InstallAppCard() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent));

    function handleInstallAvailable(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage('GymNotes is installed.');
    }

    window.addEventListener('beforeinstallprompt', handleInstallAvailable);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(outcome === 'accepted'
      ? 'Installation started.'
      : 'Installation was dismissed. You can try again from your browser menu.');
  }

  return (
    <section className="install-app-card" aria-labelledby="install-app-title">
      <div className="install-app-heading">
        <img src="/icons/gymnotes-192.png" alt="" width="52" height="52" />
        <div>
          <p className="eyebrow">Mobile app</p>
          <h2 id="install-app-title">{installed ? 'GymNotes is installed' : 'Install GymNotes'}</h2>
        </div>
        <span className={`status-dot${installed ? '' : ' muted'}`}>{installed ? 'Installed' : 'Available'}</span>
      </div>

      {installed ? (
        <p>Open GymNotes from your Home Screen for a focused, standalone workout experience.</p>
      ) : installPrompt ? (
        <>
          <p>Add GymNotes to this device for quicker access and a standalone app window.</p>
          <button className="btn" type="button" onClick={install}>Install GymNotes</button>
        </>
      ) : isIos ? (
        <ol className="install-steps">
          <li>Open GymNotes in Safari.</li>
          <li>Tap the Share button.</li>
          <li>Select <strong>Add to Home Screen</strong>, then tap Add.</li>
        </ol>
      ) : (
        <ol className="install-steps">
          <li>Open your browser menu.</li>
          <li>Select <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</li>
          <li>Confirm the installation.</li>
        </ol>
      )}

      {message && <p className="install-message" role="status">{message}</p>}
      <p className="install-online-note">Open Train and your plans once while online. Cached plans and blank workouts can then be recorded offline and synchronized after reconnecting.</p>
    </section>
  );
}
