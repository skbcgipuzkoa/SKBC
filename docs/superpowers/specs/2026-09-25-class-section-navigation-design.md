# Class Section Navigation Design

## Goal

Provide persistent direct navigation among class sections in both Dojo mode and the complete class view, while preventing accidental loss of unsaved form changes.

## Sections

The navigator shows only applicable destinations, in this order: kids attendance, kids technical work, adult technical work, adult attendance, and review/close. The current section is highlighted and completed sections show their saved state.

## Unsaved Changes

A client-side navigation guard watches editable forms. When a destination is selected with one dirty form, a dialog offers `Guardar y continuar`, `Salir sin guardar`, and `Cancelar`. Saving rewrites the form's supported `returnTo` destination and submits it. If several forms are dirty, navigation is blocked and the first changed form is brought into view so the administrator can save each block explicitly.

The browser close/refresh event also warns while tracked changes remain unsaved. Opening the close section never closes a class; the existing explicit close confirmation remains required.

## Views

- Dojo mode uses its existing step query and adds a child-technical sub-section that opens the child plan.
- Complete class mode maps the same navigator to its existing steps and section anchors.
- The navigator is horizontally scrollable on narrow screens and remains visible near the top of the working area.

## Verification

Typecheck and production build must pass. The production deployment must reach Vercel `Ready`, and the production alias must serve the new navigator and unsaved-change dialog styles.
