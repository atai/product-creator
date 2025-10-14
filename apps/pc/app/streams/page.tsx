'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Stream } from '@/lib/types';
import { useEntityList } from '@/hooks/useEntityList';

export default function StreamsPage() {
  const searchParams = useSearchParams();
  const selectedRoot = searchParams.get('root') || '';

  // Refactored to use generic hook - eliminates duplication
  const {
    items: streams,
    filteredItems: filteredStreams,
    loading,
    searchQuery,
    setSearchQuery,
  } = useEntityList<Stream>('/api/streams', (stream) => [
    stream.stream,
    stream.name || '',
    stream.goal,
  ]);

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Streams</h1>
          <Link
            href={`/streams/new${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            New Stream
          </Link>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search streams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading streams...</p>
          </div>
        ) : filteredStreams.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">
              {streams.length === 0 ? 'No streams found. Create your first stream!' : 'No matching streams found.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stream ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Goal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stages
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    KPIs
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStreams.map((stream) => (
                  <tr key={stream.stream} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/streams/${stream.stream}${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        {stream.stream}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                      {stream.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 max-w-md truncate">
                        {stream.goal}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">
                        {stream.stages.length} stage{stream.stages.length !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {stream.kpis && stream.kpis.length > 0 ? (
                          stream.kpis.map((kpi) => (
                            <span
                              key={kpi}
                              className="inline-block px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded"
                            >
                              {kpi}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/streams/${stream.stream}${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/streams/${stream.stream}/swimlanes${selectedRoot ? `?root=${encodeURIComponent(selectedRoot)}` : ''}`}
                        className="text-purple-600 hover:text-purple-900"
                      >
                        Swimlanes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
