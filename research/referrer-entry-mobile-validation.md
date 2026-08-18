# Referrer Entry Mobile Validation

The first compact Referrer-entry revision incorrectly applied the `sr-only` class to the `<label>` wrapper. Because the input was nested inside that wrapper, the company-email field became visually hidden while the Send code button remained visible. The label text is now screen-reader-only on its own inline element, while the input remains visible and autofocuses on mobile.
