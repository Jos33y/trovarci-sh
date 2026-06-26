// Admin route styles barrel - aggregates page/table/detail CSS modules into a single styles object.
// Routes import this with: import styles from '~/styles/modules/routes/admin';
import page from './admin.page.module.css';
import table from './admin.table.module.css';
import detail from './admin.detail.module.css';

export default { ...page, ...table, ...detail };
