export type HelpHintKey =
  | 'matrix'
  | 'functionForm'
  | 'functionDetail'
  | 'businessObjects'
  | 'streams'
  | 'streamDetail'
  | 'workflows'
  | 'workflowDetail'
  | 'graph'
  | 'home';

export interface HelpHint {
  title: string;
  description: string;
}

const helpHints: Record<HelpHintKey, HelpHint> = {
  matrix: {
    title: 'Function Matrix',
    description:
      'Матрица глагол/существительное показывает, какие действия реализованы для каждой сущности выбранного bounded context. Используйте её, чтобы быстро увидеть дыры в покрытии.',
  },
  functionForm: {
    title: 'Function Form',
    description:
      'Эта форма описывает новую или существующую функцию: контекст, сущность, действие, владельца, жизненный цикл и интеграции. Заполненные поля превращаются в YAML-описание и файл функции.',
  },
  functionDetail: {
    title: 'Function View',
    description:
      'Здесь отображается опубликованная карточка функции. Можно посмотреть контекст, теги, события и API, а при необходимости перейти в режим редактирования.',
  },
  businessObjects: {
    title: 'Business Objects',
    description:
      'Список доменных сущностей, их поля и связанные таблицы. Поиск помогает быстро отфильтровать нужный объект в выбранном каталоге.',
  },
  streams: {
    title: 'Streams',
    description:
      'Каталог потоков (event streams) выбранного каталога. Здесь видно владельца, жизненный цикл и краткое описание каждого потока.',
  },
  streamDetail: {
    title: 'Stream Details',
    description:
      'Карточка конкретного потока с полями, событиями и схемой. Используется для проверки структуры и влияния потока на архитектуру.',
  },
  workflows: {
    title: 'Workflows',
    description:
      'Обзор всех workflow-сценариев, которые оркестрируют функции и события. Отсюда удобно переходить к нужному процессу.',
  },
  workflowDetail: {
    title: 'Workflow Details',
    description:
      'Детальная карточка workflow: шаги, условия и связанные функции. Помогает понять, как бизнес-процесс реализован в системе.',
  },
  graph: {
    title: 'Function Graph',
    description:
      'Граф визуализирует связи функций через события. Фильтры по контексту и жизненному циклу подсказывают, где есть риски или избыточные связи.',
  },
  home: {
    title: 'Function Catalog',
    description:
      'Главная страница каталога функций. Здесь можно искать по имени, тегам, API, а также фильтровать по контекстам, владельцам и статусу.',
  },
};

const defaultHint: HelpHint = {
  title: 'Описание недоступно',
  description: 'Для этого раздела пока нет описания. Дополните справочник helpTexts.ts.',
};

export function getHelpHint(key: HelpHintKey): HelpHint {
  return helpHints[key] || defaultHint;
}





