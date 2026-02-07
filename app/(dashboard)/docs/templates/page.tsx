"use client";

import { useState } from "react";
import Link from "next/link";

interface PathExample {
  path: string;
  json: string;
  result: string;
}

const PATH_EXAMPLES: PathExample[] = [
  {
    path: "choices.0.message.content",
    json: `{
  "choices": [
    {
      "message": {
        "content": "Hello!"
      }
    }
  ]
}`,
    result: '"Hello!"',
  },
  {
    path: "content.0.text",
    json: `{
  "content": [
    {
      "type": "text",
      "text": "Hi there!"
    }
  ]
}`,
    result: '"Hi there!"',
  },
  {
    path: "candidates.0.content.parts.0.text",
    json: `{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "Greetings!" }]
      }
    }
  ]
}`,
    result: '"Greetings!"',
  },
  {
    path: "message.content",
    json: `{
  "message": {
    "role": "assistant",
    "content": "Hey!"
  }
}`,
    result: '"Hey!"',
  },
];

const PROVIDER_EXAMPLES = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4, GPT-3.5-turbo via /v1/chat/completions",
    request: {
      messagePath: "messages.0.content",
      structure: `{
  "model": "gpt-4",
  "messages": [
    { "role": "user", "content": "" }
  ],
  "max_tokens": 1024
}`,
    },
    response: {
      contentPath: "choices.0.message.content",
      tokenUsagePath: "usage",
      errorPath: "error.message",
      example: `{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help?"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 12,
    "total_tokens": 22
  }
}`,
    },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models via /v1/messages",
    request: {
      messagePath: "messages.0.content",
      structure: `{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "" }
  ]
}`,
    },
    response: {
      contentPath: "content.0.text",
      tokenUsagePath: "usage",
      errorPath: "error.message",
      example: `{
  "content": [
    { "type": "text", "text": "Hello! How can I assist?" }
  ],
  "usage": {
    "input_tokens": 10,
    "output_tokens": 15
  }
}`,
    },
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini models via generativelanguage API",
    request: {
      messagePath: "contents.0.parts.0.text",
      structure: `{
  "contents": [
    { "parts": [{ "text": "" }] }
  ]
}`,
    },
    response: {
      contentPath: "candidates.0.content.parts.0.text",
      tokenUsagePath: "usageMetadata",
      errorPath: "error.message",
      example: `{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "Hello!" }],
        "role": "model"
      }
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 5,
    "candidatesTokenCount": 10,
    "totalTokenCount": 15
  }
}`,
    },
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models via /api/chat",
    request: {
      messagePath: "messages.0.content",
      structure: `{
  "model": "llama3",
  "messages": [
    { "role": "user", "content": "" }
  ],
  "stream": false
}`,
    },
    response: {
      contentPath: "message.content",
      tokenUsagePath: undefined,
      errorPath: "error",
      example: `{
  "message": {
    "role": "assistant",
    "content": "Hello!"
  },
  "done": true,
  "eval_count": 15
}`,
    },
  },
];

function InteractivePathDemo() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const example = PATH_EXAMPLES[selectedIndex];

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">
        Interactive Path Explorer
      </h3>
      <div className="flex gap-2 mb-4 flex-wrap">
        {PATH_EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => setSelectedIndex(i)}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
              i === selectedIndex
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {ex.path}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-2">JSON Response</div>
          <pre className="bg-gray-900 rounded p-4 text-sm text-gray-300 overflow-x-auto">
            {example.json}
          </pre>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-2">
            Path: <code className="text-blue-400">{example.path}</code>
          </div>
          <div className="bg-gray-900 rounded p-4">
            <div className="text-xs text-gray-500 mb-2">Krawall extracts:</div>
            <div className="text-lg font-medium text-green-400">
              {example.result}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplateDocsPage() {
  const [activeProvider, setActiveProvider] = useState("openai");
  const provider = PROVIDER_EXAMPLES.find((p) => p.id === activeProvider) || PROVIDER_EXAMPLES[0];

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/targets/new"
            className="text-gray-400 hover:text-white text-sm"
          >
            Target Setup
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-white text-sm">Template Reference</span>
        </div>
        <h1 className="text-3xl font-bold text-white">
          Request &amp; Response Templates
        </h1>
        <p className="text-gray-400 mt-2">
          Learn how Krawall uses JSON path templates to communicate with any
          chatbot API.
        </p>
      </div>

      {/* Overview */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">How Templates Work</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                1
              </span>
              <h3 className="font-medium text-white">Request Template</h3>
            </div>
            <p className="text-sm text-gray-400">
              Defines the JSON structure sent to the API. The{" "}
              <code className="text-blue-400">messagePath</code> tells
              Krawall where to insert the test message.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                2
              </span>
              <h3 className="font-medium text-white">API Call</h3>
            </div>
            <p className="text-sm text-gray-400">
              Krawall sends the request to your target endpoint with the
              configured authentication headers.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                3
              </span>
              <h3 className="font-medium text-white">Response Mapping</h3>
            </div>
            <p className="text-sm text-gray-400">
              The response is parsed using JSON paths to extract the content,
              token usage, and error information.
            </p>
          </div>
        </div>
      </div>

      {/* JSON Path Syntax */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">JSON Path Syntax</h2>
        <p className="text-gray-400 mb-4">
          Krawall uses dot-notation paths to navigate JSON objects. Array
          elements are accessed by their numeric index.
        </p>

        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">
                    Syntax
                  </th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">
                    Description
                  </th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium">
                    Example
                  </th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                <tr className="border-b border-gray-700/50">
                  <td className="py-2 px-3 font-mono text-blue-400">
                    key.subkey
                  </td>
                  <td className="py-2 px-3">Access nested objects</td>
                  <td className="py-2 px-3 font-mono text-gray-400">
                    message.content
                  </td>
                </tr>
                <tr className="border-b border-gray-700/50">
                  <td className="py-2 px-3 font-mono text-blue-400">
                    key.0
                  </td>
                  <td className="py-2 px-3">
                    Access array element by index
                  </td>
                  <td className="py-2 px-3 font-mono text-gray-400">
                    choices.0
                  </td>
                </tr>
                <tr className="border-b border-gray-700/50">
                  <td className="py-2 px-3 font-mono text-blue-400">
                    a.0.b.c
                  </td>
                  <td className="py-2 px-3">
                    Combine nested + array access
                  </td>
                  <td className="py-2 px-3 font-mono text-gray-400">
                    choices.0.message.content
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-mono text-blue-400">
                    $.key
                  </td>
                  <td className="py-2 px-3">
                    Optional root prefix (stripped automatically)
                  </td>
                  <td className="py-2 px-3 font-mono text-gray-400">
                    $.choices.0.message.content
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Interactive Demo */}
      <InteractivePathDemo />

      {/* Request Template Reference */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">
          Request Template Fields
        </h2>
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-green-400 font-mono text-sm">
                messagePath
              </code>
              <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded">
                required
              </span>
            </div>
            <p className="text-sm text-gray-400">
              JSON path where Krawall inserts the test message into the
              request body. The message replaces the value at this path before
              each API call.
            </p>
            <div className="mt-2 text-xs text-gray-500">
              Example: <code className="text-blue-400">messages.0.content</code>{" "}
              inserts the message at{" "}
              <code className="text-gray-400">
                {`{ "messages": [{ "content": "<message>" }] }`}
              </code>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-green-400 font-mono text-sm">
                structure
              </code>
              <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded">
                recommended
              </span>
            </div>
            <p className="text-sm text-gray-400">
              The base JSON payload structure. This is the template object that
              gets cloned and populated before sending. Include all required
              fields for your API (model name, max_tokens, etc).
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-green-400 font-mono text-sm">
                variables
              </code>
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                optional
              </span>
            </div>
            <p className="text-sm text-gray-400">
              Key-value pairs for variable substitution. Any matching value in
              the structure will be replaced before sending. Useful for
              parameterizing model names or other configuration.
            </p>
          </div>
        </div>
      </div>

      {/* Response Template Reference */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">
          Response Template Fields
        </h2>
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-green-400 font-mono text-sm">
                contentPath
              </code>
              <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded">
                required
              </span>
            </div>
            <p className="text-sm text-gray-400">
              JSON path to extract the assistant&apos;s response text from the API
              response. This is the primary content that Krawall records and
              analyzes.
            </p>
            <div className="mt-2 text-xs text-gray-500">
              Color:{" "}
              <span className="text-green-400 font-medium">green</span> in
              the wizard mapper
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-green-400 font-mono text-sm">
                tokenUsagePath
              </code>
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                optional
              </span>
            </div>
            <p className="text-sm text-gray-400">
              JSON path to the token usage object. Krawall reads{" "}
              <code className="text-gray-300">promptTokens</code>,{" "}
              <code className="text-gray-300">completionTokens</code>, and{" "}
              <code className="text-gray-300">totalTokens</code> from this
              object. Different APIs use different field names — Krawall
              normalizes them automatically.
            </p>
            <div className="mt-2 text-xs text-gray-500">
              Color:{" "}
              <span className="text-blue-400 font-medium">blue</span> in the
              wizard mapper
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-green-400 font-mono text-sm">
                errorPath
              </code>
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                optional
              </span>
            </div>
            <p className="text-sm text-gray-400">
              JSON path to extract error messages from failed API responses.
              When the API returns an error, Krawall uses this path to get
              a human-readable error message for logging.
            </p>
            <div className="mt-2 text-xs text-gray-500">
              Color:{" "}
              <span className="text-red-400 font-medium">red</span> in the
              wizard mapper
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <code className="text-green-400 font-mono text-sm">
                transform
              </code>
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                optional
              </span>
            </div>
            <p className="text-sm text-gray-400">
              Content transformation to apply after extraction. Options:{" "}
              <code className="text-gray-300">none</code> (default),{" "}
              <code className="text-gray-300">markdown</code> (strip markdown
              syntax),{" "}
              <code className="text-gray-300">html</code> (strip HTML tags).
            </p>
          </div>
        </div>
      </div>

      {/* Provider Examples */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">
          Provider Examples
        </h2>
        <div className="flex gap-2 mb-6 flex-wrap">
          {PROVIDER_EXAMPLES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveProvider(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                p.id === activeProvider
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-400">{provider.description}</p>

          {/* Request */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              Request Template
            </h4>
            <div className="bg-gray-900 rounded-lg p-4 space-y-2">
              <div className="text-xs text-gray-400">
                messagePath:{" "}
                <code className="text-blue-400">
                  {provider.request.messagePath}
                </code>
              </div>
              <pre className="text-sm text-gray-300 overflow-x-auto">
                {provider.request.structure}
              </pre>
            </div>
          </div>

          {/* Response */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              Response Mapping
            </h4>
            <div className="bg-gray-900 rounded-lg p-4 space-y-2">
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="text-gray-400">
                  contentPath:{" "}
                  <code className="text-green-400">
                    {provider.response.contentPath}
                  </code>
                </span>
                {provider.response.tokenUsagePath && (
                  <span className="text-gray-400">
                    tokenUsagePath:{" "}
                    <code className="text-blue-400">
                      {provider.response.tokenUsagePath}
                    </code>
                  </span>
                )}
                {provider.response.errorPath && (
                  <span className="text-gray-400">
                    errorPath:{" "}
                    <code className="text-red-400">
                      {provider.response.errorPath}
                    </code>
                  </span>
                )}
              </div>
              <pre className="text-sm text-gray-300 overflow-x-auto">
                {provider.response.example}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">
          Troubleshooting
        </h2>
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-400 mb-2">
              &quot;No content found at path&quot;
            </h4>
            <p className="text-sm text-gray-400">
              The <code className="text-blue-400">contentPath</code> does not
              match the actual API response structure. Use the Test Connection
              button to see the raw response and verify the path is correct.
              Check for typos in field names and correct array indices.
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-400 mb-2">
              Message not appearing in request
            </h4>
            <p className="text-sm text-gray-400">
              The <code className="text-blue-400">messagePath</code> may be
              wrong. Ensure the path matches your request structure. For
              example, if your structure has{" "}
              <code className="text-gray-300">{`{ "messages": [{ "content": "" }] }`}</code>
              , the messagePath should be{" "}
              <code className="text-blue-400">messages.0.content</code>.
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-400 mb-2">
              Token usage not recorded
            </h4>
            <p className="text-sm text-gray-400">
              Either <code className="text-blue-400">tokenUsagePath</code> is
              not set, or the path doesn&apos;t match the response. Not all APIs
              return token usage (e.g., Ollama). This field is optional and
              Krawall will still work without it.
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-400 mb-2">
              Authentication errors (401/403)
            </h4>
            <p className="text-sm text-gray-400">
              Verify your auth type matches what the API expects. Common
              issues: Bearer token vs API key header, missing required headers
              (e.g., Anthropic requires both{" "}
              <code className="text-gray-300">x-api-key</code> and{" "}
              <code className="text-gray-300">anthropic-version</code>).
            </p>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-400 mb-2">
              Empty or truncated responses
            </h4>
            <p className="text-sm text-gray-400">
              Check that <code className="text-gray-300">max_tokens</code> is
              set high enough in your request structure. Some APIs have
              different default limits. Also verify that the response
              isn&apos;t being cut off by a content transformation.
            </p>
          </div>
        </div>
      </div>

      {/* Back link */}
      <div className="flex gap-4">
        <Link
          href="/targets/new"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Create a Target
        </Link>
        <Link
          href="/targets"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          View All Targets
        </Link>
      </div>
    </div>
  );
}
