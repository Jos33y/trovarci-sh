/* Aggregates the focused dashboard modules into a single styles object. */

import page from './dashboard.page.module.css';
import panel from './dashboard.panel.module.css';

export default { ...page, ...panel };
