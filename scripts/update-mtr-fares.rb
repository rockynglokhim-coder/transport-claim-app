#!/usr/bin/env ruby
# Refreshes missing Airport Express fares from MTR's official live Trip Planner API.

require "json"
require "net/http"
require "thread"
require "uri"

ROOT = File.expand_path("..", __dir__)
FARE_FILE = File.join(ROOT, "mtr-fares.json")
PLANNER_URL = "https://www.mtr.com.hk/en/customer/jp/index.php"
API_URL = "https://www.mtr.com.hk/share/customer/jp/api/HRRoutes/"

html = Net::HTTP.get(URI(PLANNER_URL))
rail_json = html[/var heavyRailDetails = (\{.*?\});\s*var lightRailDetails/m, 1]
abort "Unable to read MTR station data" unless rail_json

stations = JSON.parse(rail_json)["stations"]
station_ids = {}
stations.each { |station| station_ids[station["nameTC"]] ||= station["ID"] }

data = JSON.parse(File.read(FARE_FILE))
fares = data.fetch("fares")
ordinary_stations = fares.keys.flat_map { |key| key.split("|") }.uniq
targets = []
["機場", "博覽館"].each do |special_station|
  ordinary_stations.each { |station| targets << [special_station, station] }
end
targets << ["機場", "博覽館"]

queue = Queue.new
targets.each { |pair| queue << pair }
results = Queue.new

workers = 5.times.map do
  Thread.new do
    loop do
      origin, destination = queue.pop(true)
      uri = URI(API_URL)
      uri.query = URI.encode_www_form(o: station_ids.fetch(origin), d: station_ids.fetch(destination), lang: "C")
      response = Net::HTTP.get_response(uri)
      raise "HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

      route = JSON.parse(response.body).dig("routes", 0)
      raise "No official route returned" unless route
      components = route.fetch("fares")
      amount = components.sum do |component|
        value = component.dig("fareInfo", "adult", "octopus")
        value == "免費" ? 0.0 : Float(value)
      end
      results << [[origin, destination].sort.join("|"), amount.round(1)]
    rescue ThreadError
      break
    rescue StandardError => error
      warn "#{origin} -> #{destination}: #{error.message}"
      exit 1
    end
  end
end
workers.each(&:join)
until results.empty?
  key, amount = results.pop
  fares[key] = amount
end

data["source"] = "MTR official Adult Octopus fares"
data["sourceUrl"] = "https://www.mtr.com.hk/en/customer/tickets/qr_code_ticket_fares.html"
data["liveApiUrl"] = API_URL
data["verifiedOn"] = "2026-08-12"
data["fares"] = fares.sort.to_h
File.write(FARE_FILE, JSON.generate(data) + "\n")
puts "Updated #{targets.length} Airport Express pairs; total pairs: #{fares.length}"
