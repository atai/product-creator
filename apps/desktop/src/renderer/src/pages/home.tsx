export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-8 py-16">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-6">Product Creator</h1>
          <p className="text-lg text-gray-700 mb-4">
            Система управления каталогом продуктов и бизнес-функций.
          </p>
          <p className="text-gray-600 mb-6">
            Используйте навигационное меню для доступа к различным разделам:
          </p>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="font-semibold mr-2">•</span>
              <span><strong>Functions</strong> — каталог бизнес-функций с поиском и фильтрацией</span>
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
