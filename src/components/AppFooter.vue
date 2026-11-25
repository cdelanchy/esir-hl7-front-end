<template>
  <footer class="app-footer">
    <!-- Grille à 3 colonnes : chaque cellule existe toujours pour garder le centre centré. -->
    <div class="footer-cell footer-left">
      <a
        v-if="parentRepositoryUrl"
        class="footer-github"
        :href="parentRepositoryUrl"
        target="_blank"
        rel="noopener noreferrer"
        title="Dépôt instructions du TP"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
          <path :d="githubIconPath" />
        </svg>
        <span>Instructions du TP</span>
      </a>
    </div>
    <div class="footer-cell footer-center">
      <a
        v-if="repositoryUrl"
        class="footer-github"
        :href="repositoryUrl"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Dépôt GitHub du projet"
        title="Dépôt GitHub du projet"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
          <path :d="githubIconPath" />
        </svg>
      </a>
    </div>
    <div class="footer-cell footer-right">
      <a
        class="footer-license"
        href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr"
        target="_blank"
        rel="license noopener noreferrer"
      >
        <img :src="licenseLogo" width="88" height="31" alt="Licence Creative Commons BY-NC-SA 4.0" />
      </a>
    </div>
  </footer>
</template>

<script>
import { config } from '@/config'
import licenseLogo from '@/assets/cc-by-nc-sa.png'

// Icône « mark-github » des Octicons de GitHub (licence MIT), viewBox 0 0 24 24.
const GITHUB_ICON_PATH = 'M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943'

export default {
  name: 'AppFooter',
  data () {
    return {
      repositoryUrl: config.repositoryUrl,
      parentRepositoryUrl: config.parentRepositoryUrl,
      licenseLogo,
      githubIconPath: GITHUB_ICON_PATH
    }
  }
}
</script>

<style scoped>
.app-footer {
  box-sizing: border-box;
  width: min(60vw, 1536px);
  min-width: 320px;
  margin: 0 auto;
  padding: 16px 24px 32px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  border-top: 1px solid #e2e8f0;
  font-size: 13px;
  color: #64748b;
}

@media (max-width: 768px) {
  .app-footer {
    width: 92vw;
    min-width: 0;
  }
}

.footer-cell {
  display: flex;
  align-items: center;
}

.footer-left {
  justify-content: flex-start;
}

.footer-center {
  justify-content: center;
}

.footer-right {
  justify-content: flex-end;
}

/* Petit écran : les trois éléments s'empilent, centrés. */
@media (max-width: 480px) {
  .app-footer {
    grid-template-columns: 1fr;
  }

  .footer-cell {
    justify-content: center;
  }

  .footer-cell:empty {
    display: none;
  }
}

.app-footer .footer-github {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #1f2a37;
  transition: color 0.15s ease;
}

.app-footer .footer-github:hover,
.app-footer .footer-github:focus-visible {
  color: #2a5ad6;
}

.app-footer a {
  color: #2a5ad6;
  font-weight: 600;
  text-decoration: none;
}

.app-footer a:hover {
  text-decoration: underline;
}

.footer-license {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.footer-license img {
  display: block;
}
</style>
