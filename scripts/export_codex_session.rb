#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "base64"
require "fileutils"
require "json"
require "time"

SOURCE = ARGV.fetch(0) do
  abort "usage: #{$PROGRAM_NAME} SESSION.jsonl OUTPUT_DIRECTORY"
end
OUTPUT_DIRECTORY = ARGV.fetch(1) do
  abort "usage: #{$PROGRAM_NAME} SESSION.jsonl OUTPUT_DIRECTORY"
end

# The first timestamp is Graham's first Sketchpad request. The cutoff is the
# first request that moves the same long-running session to unrelated G work.
START_AT = Time.iso8601("2026-09-14T22:44:53.193Z")
CUTOFF_AT = Time.iso8601("2026-09-16T04:29:31.174Z")

AUTOMATIC_CONTEXT_PREFIXES = [
  "<environment_context>",
  "<recommended_plugins>",
  "# AGENTS.md instructions"
].freeze

PUBLIC_PATH_REPLACEMENTS = {
  "/tmp/codex-remote-attachments/01a0a218-34bd-7b81-9c36-dfff1cd53265/6948218D-C25E-442C-8C75-0A70D812761C/1-Photo-1.jpg" =>
    "assets/mobile-input-failure-2026-09-15-1137.jpg",
  "/tmp/codex-remote-attachments/01a0a218-34bd-7b81-9c36-dfff1cd53265/50BFA93C-5CDC-4979-A700-7968073D3CC3/1-Photo-1.jpg" =>
    "assets/mobile-input-failure-2026-09-15-1201.jpg",
  "/tmp/codex-remote-attachments/01a0a218-34bd-7b81-9c36-dfff1cd53265/027CE910-467D-4692-8445-E6EC49535BD5/1-Photo-1.jpg" =>
    "assets/browser-drawing-2026-09-16.jpg"
}.freeze

REDACTIONS = [
  [/-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----/m,
   "[REDACTED PRIVATE KEY]"],
  [/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{20,}\b/, "[REDACTED API TOKEN]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "[REDACTED GITHUB TOKEN]"],
  [/\bAKIA[0-9A-Z]{16}\b/, "[REDACTED AWS ACCESS KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+\/=:-]{20,}/i, "Bearer [REDACTED TOKEN]"]
].freeze

def redact(text)
  public_text = PUBLIC_PATH_REPLACEMENTS.reduce(text.to_s.dup) do |value, (private_path, public_path)|
    value.gsub(private_path, public_path)
  end
  REDACTIONS.reduce(public_text) { |value, (pattern, replacement)| value.gsub(pattern, replacement) }
end

def text_from_message(payload)
  payload.fetch("content", []).each_with_object([]) do |part, texts|
    texts << part["text"] if %w[input_text output_text].include?(part["type"])
  end.join("\n\n")
end

def automatic_context?(role, text)
  role == "user" && AUTOMATIC_CONTEXT_PREFIXES.any? { |prefix| text.lstrip.start_with?(prefix) }
end

def markdown_text(text)
  text.split("\n", -1).map(&:rstrip).join("\n").rstrip
end

def preserve_public_attachment(payload, original_text)
  mapping = PUBLIC_PATH_REPLACEMENTS.find { |private_path, _| original_text.include?(private_path) }
  return unless mapping

  image = payload.fetch("content", []).find { |part| part["type"] == "input_image" }
  return unless image

  match = image.fetch("image_url").match(%r{\Adata:image/(?:jpeg|jpg);base64,(.+)\z}m)
  raise "unsupported attachment encoding for #{mapping.first}" unless match

  output_path = File.join(OUTPUT_DIRECTORY, mapping.last)
  FileUtils.mkdir_p(File.dirname(output_path))
  # Prefer an already-preserved original attachment. The session's embedded
  # image can be a resized model-input derivative.
  return if File.exist?(output_path)

  File.binwrite(output_path, Base64.strict_decode64(match[1]))
end

def sha256_json(value)
  serialized = JSON.generate(value)
  [serialized.bytesize, Digest::SHA256.hexdigest(serialized)]
end

FileUtils.mkdir_p(OUTPUT_DIRECTORY)

conversation_jsonl_path = File.join(OUTPUT_DIRECTORY, "conversation.jsonl")
conversation_markdown_path = File.join(OUTPUT_DIRECTORY, "conversation.md")
tool_ledger_path = File.join(OUTPUT_DIRECTORY, "tool-ledger.jsonl.gz")
tool_ledger_uncompressed_path = File.join(OUTPUT_DIRECTORY, "tool-ledger.jsonl")
metadata_path = File.join(OUTPUT_DIRECTORY, "session-metadata.json")

raw_sha256 = Digest::SHA256.file(SOURCE).hexdigest
raw_bytes = File.size(SOURCE)
source_slice_sha256 = Digest::SHA256.new
source_slice_bytes = 0
session_metadata = nil
turn_contexts = []
conversation_count = 0
tool_call_count = 0
tool_output_count = 0
public_transformation_count = 0

conversation_jsonl = File.open(conversation_jsonl_path, "wb")
conversation_markdown = File.open(conversation_markdown_path, "wb")
tool_ledger = File.open(tool_ledger_uncompressed_path, "wb")

conversation_markdown.write("# Sketchpad reconstruction agent transcript\n\n")
conversation_markdown.write("Public archival export of the human-visible conversation. ")
conversation_markdown.write("Times are UTC. Tool activity is recorded separately.\n\n")

File.foreach(SOURCE) do |line|
  item = JSON.parse(line)
  timestamp = Time.iso8601(item.fetch("timestamp"))

  if item["type"] == "session_meta"
    payload = item.fetch("payload")
    session_metadata = {
      "session_id" => payload["id"] || payload["session_id"],
      "started_at" => item["timestamp"],
      "initial_cwd" => payload["cwd"],
      "cli_version" => payload["cli_version"],
      "source" => payload["source"],
      "originator" => payload["originator"],
      "model_provider" => payload["model_provider"]
    }
  end

  if item["type"] == "turn_context"
    payload = item.fetch("payload")
    turn_contexts << {
      "model" => payload["model"],
      "effort" => payload["effort"],
      "cwd" => payload["cwd"]
    }
  end

  next if timestamp < START_AT
  break if timestamp >= CUTOFF_AT

  source_slice_sha256.update(line)
  source_slice_bytes += line.bytesize
  next unless item["type"] == "response_item"

  payload = item.fetch("payload")
  case payload["type"]
  when "message"
    role = payload["role"]
    next unless %w[user assistant].include?(role)

    original_text = text_from_message(payload)
    next if original_text.empty? || automatic_context?(role, original_text)

    preserve_public_attachment(payload, original_text) if role == "user"

    public_text = redact(original_text)
    public_transformation_count += 1 if public_text != original_text
    record = {
      "timestamp" => item["timestamp"],
      "id" => payload["id"],
      "role" => role,
      "phase" => payload["phase"],
      "text" => public_text,
      "original_text_sha256" => Digest::SHA256.hexdigest(original_text)
    }.compact
    conversation_jsonl.write(JSON.generate(record) << "\n")

    heading = role == "user" ? "Graham" : "Codex"
    phase = payload["phase"] ? " (#{payload['phase']})" : ""
    conversation_markdown.write("## #{item['timestamp']} — #{heading}#{phase}\n\n")
    conversation_markdown.write(markdown_text(public_text) << "\n\n")
    conversation_count += 1
  when "custom_tool_call", "function_call"
    original_input = payload["input"] || payload["arguments"] || ""
    public_input = redact(original_input)
    public_transformation_count += 1 if public_input != original_input
    record = {
      "timestamp" => item["timestamp"],
      "kind" => "call",
      "tool_type" => payload["type"],
      "call_id" => payload["call_id"],
      "name" => payload["name"],
      "input" => public_input,
      "original_input_bytes" => original_input.bytesize,
      "original_input_sha256" => Digest::SHA256.hexdigest(original_input)
    }
    tool_ledger.write(JSON.generate(record) << "\n")
    tool_call_count += 1
  when "custom_tool_call_output", "function_call_output"
    output = payload["output"]
    output_bytes, output_sha256 = sha256_json(output)
    # Outputs can contain private credentials, copyrighted scan pixels, and
    # multi-megabyte binary payloads. Preserve their integrity metadata, not
    # their content, in the public repository.
    record = {
      "timestamp" => item["timestamp"],
      "kind" => "output_digest",
      "tool_type" => payload["type"],
      "call_id" => payload["call_id"],
      "output_json_bytes" => output_bytes,
      "output_json_sha256" => output_sha256
    }
    tool_ledger.write(JSON.generate(record) << "\n")
    tool_output_count += 1
  end
end

conversation_jsonl.close
conversation_markdown.close
# End with one newline. This also keeps Git's whitespace checks clean while the
# JSONL export retains the exact public text.
File.write(conversation_markdown_path, File.read(conversation_markdown_path).rstrip << "\n")
tool_ledger.close
abort "gzip failed" unless system("gzip", "-n", "-f", tool_ledger_uncompressed_path)

models = turn_contexts.map { |context| context["model"] }.compact.uniq
efforts = turn_contexts.map { |context| context["effort"] }.compact.uniq
working_directories = turn_contexts.map { |context| context["cwd"] }.compact.uniq

metadata = (session_metadata || {}).merge(
  "export_scope" => {
    "starts_at" => START_AT.iso8601(3),
    "ends_before" => CUTOFF_AT.iso8601(3),
    "reason_for_cutoff" => "The next user message moved the session to unrelated G-language work."
  },
  "models" => models,
  "reasoning_efforts" => efforts,
  "working_directories" => working_directories,
  "raw_log" => {
    "basename" => File.basename(SOURCE),
    "bytes" => raw_bytes,
    "sha256" => raw_sha256,
    "committed" => false
  },
  "source_slice" => {
    "bytes" => source_slice_bytes,
    "sha256" => source_slice_sha256.hexdigest,
    "committed" => false
  },
  "export_counts" => {
    "conversation_messages" => conversation_count,
    "tool_calls" => tool_call_count,
    "tool_output_digests" => tool_output_count,
    "records_with_public_transformations" => public_transformation_count
  }
)

File.write(metadata_path, JSON.pretty_generate(metadata) << "\n")

warn JSON.generate(metadata.fetch("export_counts"))
