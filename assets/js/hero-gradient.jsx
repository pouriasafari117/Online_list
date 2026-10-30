import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FeraGradient, { opalRecipe } from './fera-gradient-engine.jsx';

// Match the attached Fera presets: Opal by day, Emerald by night.
const emeraldRecipe = {
  ...opalRecipe,
  name: 'Emerald',
  speed: 26,
  stops: ['#F0FBEF', '#8FE3B0', '#22C79A', '#0B5F51'],
  params: { scale: 50, distortion: 44, swirl: 6 }
};

function currentTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function PageGradient() {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setTheme(currentTheme());
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    systemTheme.addEventListener?.('change', update);
    return () => {
      observer.disconnect();
      systemTheme.removeEventListener?.('change', update);
    };
  }, []);

  const recipe = theme === 'dark' ? emeraldRecipe : opalRecipe;
  return (
    <FeraGradient
      key={theme}
      recipe={recipe}
      className="page-gradient-engine"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', aspectRatio: 'auto' }}
    />
  );
}

const mount = document.getElementById('pageGradientRoot');
if (mount) createRoot(mount).render(<PageGradient />);
