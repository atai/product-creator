export default function Home() {
  return (
    <div className="min-h-full bg-bg">
      <div className="max-w-4xl mx-auto px-8 py-16">
        <div className="bg-surface rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-fg mb-6">Product Creator</h1>
          <p className="text-lg text-fg-2 mb-4">
            Система управления каталогом продукта: фичи (бизнес-возможности), объекты и процессы.
          </p>
          <p className="text-muted mb-6">
            Используйте навигационное меню для доступа к различным разделам:
          </p>
          <ul className="space-y-3 text-fg-2">
            <li className="flex items-start">
              <span className="font-semibold mr-2">•</span>
              <span><strong>Features</strong> — бизнес-возможности продукта с поиском и фильтрацией (код, который их реализует, — в source_file)</span>
            </li>
            <li className="flex items-start">
              <span className="font-semibold mr-2">•</span>
              <span><strong>Objects</strong> — управление бизнес-объектами</span>
            </li>
            <li className="flex items-start">
              <span className="font-semibold mr-2">•</span>
              <span><strong>Workflows</strong> — управление рабочими процессами</span>
            </li>
            <li className="flex items-start">
              <span className="font-semibold mr-2">•</span>
              <span><strong>Streams</strong> — управление потоками данных</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
