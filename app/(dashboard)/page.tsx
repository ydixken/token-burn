export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="animate-fadeIn">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-400 mt-2">
          Welcome to Token-Burn - Your Chatbot Testing Platform
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slideIn">
        {/* Quick Stats Cards */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400">Total Targets</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400">Total Scenarios</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400">Active Sessions</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400">Total Tests Run</h3>
          <p className="text-3xl font-bold mt-2">0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sessions */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Recent Sessions</h3>
          <div className="text-gray-400 text-center py-8">No sessions yet</div>
        </div>

        {/* Active Jobs */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Active Jobs</h3>
          <div className="text-gray-400 text-center py-8">No active jobs</div>
        </div>
      </div>

      {/* Getting Started */}
      <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-400 mb-2">Getting Started</h3>
        <p className="text-gray-300 mb-4">
          Start testing your chatbots by following these steps:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-300">
          <li>Create a target chatbot endpoint</li>
          <li>Design a test scenario with conversation flows</li>
          <li>Execute the scenario and monitor results</li>
          <li>Analyze metrics and optimize your chatbot</li>
        </ol>
      </div>
    </div>
  );
}
