import styles from '~/styles/modules/blog/BlogContent.module.css';

export default function BlogContent({ html }) {
  return (
    <div
      className={styles.content}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
