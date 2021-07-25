define(["events", "datetime", "appSettings", "itemHelper", "pluginManager", "playQueueManager", "userSettings", "globalize", "connectionManager", "loading", "apphost", "fullscreenManager"],
function(events, datetime, appSettings, itemHelper, pluginManager, PlayQueueManager, userSettings, globalize, connectionManager, loading, apphost, fullscreenManager) {
	"use strict";
	function enableLocalPlaylistManagement(player) {
		return ! player.getPlaylist && !!player.isLocalPlayer
	}
	function returnResolve() {
		return Promise.resolve()
	}
	function reportPlayback(playbackManagerInstance, state, player, reportPlaylist, serverId, method, progressEventName, additionalData) {
		if (!serverId) return Promise.resolve();
		if (!1 === state.IsFullscreen) return Promise.resolve();
		var info = Object.assign({},
		state.PlayState);
		return additionalData && (info = Object.assign(info, additionalData)),
		info.ItemId = state.NowPlayingItem.Id,
		info.ItemId ? (progressEventName && (info.EventName = progressEventName), info.PlaylistIndex = state.PlaylistIndex, info.PlaylistLength = state.PlaylistLength, info.NextMediaType = state.NextMediaType, reportPlaylist &&
		function(playbackManagerInstance, info, player, serverId) {
			info.NowPlayingQueue = function(playbackManagerInstance, player) {
				return ! player || enableLocalPlaylistManagement(player) ? playbackManagerInstance._playQueueManager.getPlaylist() : player.getPlaylistSync()
			} (playbackManagerInstance, player).map(function(i) {
				var itemInfo = {
					Id: i.Id,
					PlaylistItemId: i.PlaylistItemId
				};
				return i.ServerId !== serverId && (itemInfo.ServerId = i.ServerId),
				itemInfo
			})
		} (playbackManagerInstance, info, player, serverId), connectionManager.getApiClient(serverId)[method](info).
		catch(returnResolve)) : Promise.resolve()
	}
	function normalizeName(t) {
		return t.toLowerCase().replace(" ", "")
	}
	var PlaybackItemFields = "Chapters,ProductionYear,PremiereDate";
	function getItemsForPlayback(serverId, query) {
		var apiClient = connectionManager.getApiClient(serverId);
		if (query.Ids && 1 === query.Ids.split(",").length) {
			var itemId = query.Ids.split(",");
			return apiClient.getItem(apiClient.getCurrentUserId(), itemId).then(function(item) {
				return {
					Items: [item],
					TotalRecordCount: 1
				}
			})
		}
		return query.Limit = query.Limit || 300,
		query.Fields = PlaybackItemFields,
		query.ExcludeLocationTypes = "Virtual",
		query.EnableTotalRecordCount = !1,
		query.CollapseBoxSetItems = !1,
		apiClient.getItems(apiClient.getCurrentUserId(), query)
	}
	function mergePlaybackQueries(obj1, obj2) {
		var query = Object.assign(obj1, obj2),
		filters = query.Filters ? query.Filters.split(",") : [];
		return - 1 === filters.indexOf("IsNotFolder") && filters.push("IsNotFolder"),
		query.Filters = filters.join(","),
		query
	}
	function getMimeType(type, container) {
		if (container = (container || "").toLowerCase(), "audio" === type) {
			if ("opus" === container) return "audio/ogg";
			if ("webma" === container) return "audio/webm";
			if ("m4a" === container) return "audio/mp4"
		} else if ("video" === type) {
			if ("mkv" === container) return "video/x-matroska";
			if ("m4v" === container) return "video/mp4";
			if ("mov" === container) return "video/quicktime";
			if ("mpg" === container) return "video/mpeg";
			if ("flv" === container) return "video/x-flv"
		}
		return type + "/" + container
	}
	function isAutomaticPlayer(player) {
		return !! player.isLocalPlayer
	}
	function getDefaultIntros() {
		return Promise.resolve({
			Items: []
		})
	}
	function getAudioMaxValues(deviceProfile) {
		var maxAudioSampleRate = null,
		maxAudioBitDepth = null,
		maxAudioBitrate = null;
		return deviceProfile.CodecProfiles.map(function(codecProfile) {
			"Audio" === codecProfile.Type && (codecProfile.Conditions || []).map(function(condition) {
				"LessThanEqual" === condition.Condition && "AudioBitDepth" === condition.Property && (maxAudioBitDepth = condition.Value),
				"LessThanEqual" === condition.Condition && "AudioSampleRate" === condition.Property && (maxAudioSampleRate = condition.Value),
				"LessThanEqual" === condition.Condition && "AudioBitrate" === condition.Property && (maxAudioBitrate = condition.Value)
			})
		}),
		{
			maxAudioSampleRate: maxAudioSampleRate,
			maxAudioBitDepth: maxAudioBitDepth,
			maxAudioBitrate: maxAudioBitrate
		}
	}
	function setStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPosition) {
		return function(items, deviceProfile, maxBitrate, apiClient, startPosition) {
			var audioTranscodingProfile = deviceProfile.TranscodingProfiles.filter(function(p) {
				return "Audio" === p.Type && "Streaming" === p.Context
			})[0],
			audioDirectPlayContainers = "";
			deviceProfile.DirectPlayProfiles.map(function(p) {
				"Audio" === p.Type && (audioDirectPlayContainers ? audioDirectPlayContainers += "," + p.Container: audioDirectPlayContainers = p.Container, p.AudioCodec && (audioDirectPlayContainers += "|" + p.AudioCodec))
			});
			var maxValues = getAudioMaxValues(deviceProfile),
			enableRemoteMedia = apphost.supports("remoteaudio");
			return apiClient.getAudioStreamUrls(items, audioTranscodingProfile, audioDirectPlayContainers, maxValues.maxAudioBitrate || maxBitrate, maxValues.maxAudioSampleRate, maxValues.maxAudioBitDepth, startPosition, enableRemoteMedia)
		} (items, deviceProfile, maxBitrate, apiClient, startPosition).then(function(streamUrls) {
			for (var i = 0,
			length = items.length; i < length; i++) {
				var item = items[i],
				streamUrl = streamUrls[i];
				streamUrl && (item.MediaSources || (item.MediaSources = []), item.MediaSources.length || item.MediaSources.push({
					Id: item.Id,
					MediaStreams: [],
					RunTimeTicks: item.RunTimeTicks
				}),
				function(mediaSources, streamUrl) {
					for (var i = 0,
					length = mediaSources.length; i < length; i++) mediaSources[i].StreamUrl = streamUrl
				} (item.MediaSources, streamUrl))
			}
		})
	}
	function getPlaybackInfo(player, apiClient, item, deviceProfile, maxBitrate, startPosition, isPlayback, mediaSourceId, audioStreamIndex, subtitleStreamIndex, currentPlaySessionId, liveStreamId, enableDirectPlay, enableDirectStream, allowVideoStreamCopy, allowAudioStreamCopy) {
		if ("Audio" === item.MediaType) return Promise.resolve({
			MediaSources: [{
				StreamUrl: function(item, deviceProfile, maxBitrate, apiClient, startPosition) {
					var transcodingProfile = deviceProfile.TranscodingProfiles.filter(function(p) {
						return "Audio" === p.Type && "Streaming" === p.Context
					})[0],
					directPlayContainers = "";
					deviceProfile.DirectPlayProfiles.map(function(p) {
						"Audio" === p.Type && (directPlayContainers ? directPlayContainers += "," + p.Container: directPlayContainers = p.Container, p.AudioCodec && (directPlayContainers += "|" + p.AudioCodec))
					});
					var maxValues = getAudioMaxValues(deviceProfile),
					enableRemoteMedia = apphost.supports("remoteaudio");
					return apiClient.getAudioStreamUrl(item, transcodingProfile, directPlayContainers, maxValues.maxAudioBitrate || maxBitrate, maxValues.maxAudioSampleRate, maxValues.maxAudioBitDepth, startPosition, enableRemoteMedia)
				} (item, deviceProfile, maxBitrate, apiClient, startPosition),
				Id: item.Id,
				MediaStreams: [],
				RunTimeTicks: item.RunTimeTicks
			}]
		});
		if (item.MediaSources && item.MediaSources.length && item.MediaSources[0].StreamUrl) return Promise.resolve({
			MediaSources: item.MediaSources
		});
		var itemId = item.Id,
		query = {
			UserId: apiClient.getCurrentUserId(),
			StartTimeTicks: startPosition || 0
		};
		return isPlayback ? (query.IsPlayback = !0, query.AutoOpenLiveStream = !0) : (query.IsPlayback = !1, query.AutoOpenLiveStream = !1),
		null != audioStreamIndex && (query.AudioStreamIndex = audioStreamIndex),
		null != subtitleStreamIndex && (query.SubtitleStreamIndex = subtitleStreamIndex),
		null != enableDirectPlay && (query.EnableDirectPlay = enableDirectPlay),
		null != enableDirectStream && (query.EnableDirectStream = enableDirectStream),
		null != allowVideoStreamCopy && (query.AllowVideoStreamCopy = allowVideoStreamCopy),
		null != allowAudioStreamCopy && (query.AllowAudioStreamCopy = allowAudioStreamCopy),
		mediaSourceId && (query.MediaSourceId = mediaSourceId),
		liveStreamId && (query.LiveStreamId = liveStreamId),
		maxBitrate && (query.MaxStreamingBitrate = maxBitrate),
		player.enableMediaProbe && !player.enableMediaProbe(item) && (query.EnableMediaProbe = !1),
		currentPlaySessionId && (query.CurrentPlaySessionId = currentPlaySessionId),
		player.getDirectPlayProtocols && (query.DirectPlayProtocols = player.getDirectPlayProtocols()),
		apiClient.getPlaybackInfo(itemId, query, deviceProfile)
	}
	function supportsDirectPlay(apiClient, item, mediaSource) {
		var isFolderRip = "BluRay" === mediaSource.VideoType || "Dvd" === mediaSource.VideoType || "bluray" === mediaSource.Container || "dvd" === mediaSource.Container;
		if (mediaSource.SupportsDirectPlay || isFolderRip) {
			if (mediaSource.IsRemote && !apphost.supports("remotevideo")) return Promise.resolve(!1);
			if ("Http" === mediaSource.Protocol && !mediaSource.RequiredHttpHeaders.length) return mediaSource.SupportsDirectStream || mediaSource.SupportsTranscoding ?
			function(mediaSource, apiClient) {
				return mediaSource.IsRemote ? Promise.resolve(!0) : apiClient.getEndpointInfo().then(function(endpointInfo) {
					if (endpointInfo.IsInNetwork) {
						if (!endpointInfo.IsLocal) {
							var path = (mediaSource.Path || "").toLowerCase();
							if ( - 1 !== path.indexOf("localhost") || -1 !== path.indexOf("127.0.0.1")) return Promise.resolve(!1)
						}
						return Promise.resolve(!0)
					}
					return Promise.resolve(!1)
				})
			} (mediaSource, apiClient) : Promise.resolve(!0);
			if ("File" === mediaSource.Protocol) return new Promise(function(resolve, reject) {
				require(["filesystem"],
				function(filesystem) {
					filesystem[isFolderRip ? "directoryExists": "fileExists"](mediaSource.Path).then(function() {
						resolve(!0)
					},
					function() {
						resolve(!1)
					})
				})
			})
		}
		return Promise.resolve(!1)
	}
	function validatePlaybackInfoResult(instance, result) {
		if (!result.ErrorCode) return 1;
		showPlaybackInfoErrorMessage(instance, result.ErrorCode)
	}
	function showPlaybackInfoErrorMessage(instance, errorCode, playNextTrack) {
		require(["alert"],
		function(alert) {
			loading.hide();
			var title = "RateLimitExceeded" === errorCode ? "RateLimitExceeded": "PlaybackError" + errorCode;
			alert({
				text: globalize.translate(title),
				title: globalize.translate("HeaderPlaybackError")
			}).then(function() {
				playNextTrack && "RateLimitExceeded" !== errorCode && instance.nextTrack()
			})
		})
	}
	function normalizePlayOptions(playOptions) {
		playOptions.fullscreen = !1 !== playOptions.fullscreen
	}
	function displayPlayerIndividually(player) {
		return ! player.isLocalPlayer
	}
	function createTarget(instance, player) {
		for (var allMediaTypes = ["Audio", "Video", "Game", "Photo", "Book"], mediaTypes = [], i = 0, length = allMediaTypes.length; i < length; i++) {
			var mediaType = allMediaTypes[i];
			player.canPlayMediaType(mediaType) && mediaTypes.push(mediaType)
		}
		return {
			name: player.name,
			id: player.id,
			playerName: player.name,
			playableMediaTypes: mediaTypes,
			isLocalPlayer: player.isLocalPlayer,
			supportedCommands: instance.getSupportedCommands(player)
		}
	}
	function getPlayerTargets(player) {
		return player.getTargets ? player.getTargets() : Promise.resolve([createTarget(player)])
	}
	function sortPlayerTargets(a, b) {
		var aVal = a.isLocalPlayer ? 0 : 1,
		bVal = b.isLocalPlayer ? 0 : 1,
		aVal = aVal.toString() + a.name,
		bVal = bVal.toString() + b.name;
		return aVal.localeCompare(bVal)
	}
	function PlaybackManager() {
		var currentTargetInfo, self = this,
		players = [],
		currentPairingId = null;
		this._playNextAfterEnded = !0;
		var playerStates = {};
		function getSubtitleStream(player, index) {
			return self.subtitleTracks(player).filter(function(s) {
				return "Subtitle" === s.Type && s.Index === index
			})[0]
		}
		function removeCurrentPlayer(player) {
			var previousPlayer = self._currentPlayer;
			previousPlayer && player.id !== previousPlayer.id || setCurrentPlayerInternal(null)
		}
		function setCurrentPlayerInternal(player, targetInfo) {
			var previousPlayer = self._currentPlayer,
			previousTargetInfo = currentTargetInfo;
			if (player && !targetInfo && player.isLocalPlayer && (targetInfo = createTarget(self, player)), player && !targetInfo) throw new Error("targetInfo cannot be null");
			currentPairingId = null,
			self._currentPlayer = player,
			(currentTargetInfo = targetInfo) && console.log("Active player: " + JSON.stringify(targetInfo)),
			player && player.isLocalPlayer && 0,
			previousPlayer && self.endPlayerUpdates(previousPlayer),
			player && self.beginPlayerUpdates(player),
			function(playbackManagerInstance, newPlayer, newTarget, previousPlayer, previousTargetInfo) { (newPlayer || previousPlayer) && (newTarget && previousTargetInfo && newTarget.id === previousTargetInfo.id || events.trigger(playbackManagerInstance, "playerchange", [newPlayer, newTarget, previousPlayer]))
			} (self, player, targetInfo, previousPlayer, previousTargetInfo)
		}
		function getSavedMaxStreamingBitrate(apiClient, mediaType) {
			var endpointInfo = (apiClient = apiClient || connectionManager.currentApiClient()).getSavedEndpointInfo() || {};
			return appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType)
		}
		function getDeliveryMethod(subtitleStream) {
			return subtitleStream.DeliveryMethod ? subtitleStream.DeliveryMethod: subtitleStream.IsExternal ? "External": "Embed"
		}
		function canPlayerSeek(player) {
			if (!player) throw new Error("player cannot be null");
			return - 1 !== (getPlayerData(player).streamInfo.url || "").toLowerCase().indexOf(".m3u8") || (player.seekable ? player.seekable() : "Transcode" !== self.playMethod(player) && player.duration())
		}
		function changeStream(player, ticks, params, progressEventName) {
			var liveStreamId, lastMediaInfoQuery, playSessionId, currentItem;
			canPlayerSeek(player) && null == params ? player.currentTime(parseInt(ticks / 1e4)) : (params = params || {},
			liveStreamId = getPlayerData(player).streamInfo.liveStreamId, lastMediaInfoQuery = getPlayerData(player).streamInfo.lastMediaInfoQuery, playSessionId = self.playSessionId(player), currentItem = self.currentItem(player), player.getDeviceProfile(currentItem, {
				isRetry: !1 === params.EnableDirectPlay
			}).then(function(deviceProfile) {
				var audioStreamIndex = null == params.AudioStreamIndex ? getPlayerData(player).audioStreamIndex: params.AudioStreamIndex,
				subtitleStreamIndex = null == params.SubtitleStreamIndex ? getPlayerData(player).subtitleStreamIndex: params.SubtitleStreamIndex,
				currentMediaSource = self.currentMediaSource(player),
				apiClient = connectionManager.getApiClient(currentItem.ServerId);
				ticks = ticks && parseInt(ticks);
				var maxBitrate = params.MaxStreamingBitrate || self.getMaxStreamingBitrate(player),
				currentPlayOptions = currentItem.playOptions || {};
				getPlaybackInfo(player, apiClient, currentItem, deviceProfile, maxBitrate, ticks, !0, currentMediaSource.Id, audioStreamIndex, subtitleStreamIndex, playSessionId, liveStreamId, params.EnableDirectPlay, params.EnableDirectStream, params.AllowVideoStreamCopy, params.AllowAudioStreamCopy).then(function(result) {
					if (validatePlaybackInfoResult(self, result)) {
						currentMediaSource = result.MediaSources[0];
						var streamInfo = createStreamInfo(apiClient, currentItem.MediaType, currentItem, currentMediaSource, ticks);
						if (streamInfo.fullscreen = currentPlayOptions.fullscreen, streamInfo.lastMediaInfoQuery = lastMediaInfoQuery, !streamInfo.url) return void showPlaybackInfoErrorMessage(self, "NoCompatibleStream", !0);
						getPlayerData(player).subtitleStreamIndex = subtitleStreamIndex,
						getPlayerData(player).audioStreamIndex = audioStreamIndex,
						getPlayerData(player).maxStreamingBitrate = maxBitrate,
						function(apiClient, player, playSessionId, streamInfo, progressEventName) {
							var playerData = getPlayerData(player);
							playerData.isChangingStream = !0,
							playerData.streamInfo && playSessionId ? apiClient.stopActiveEncodings(playSessionId).then(function() {
								function afterSetSrc() {
									apiClient.stopActiveEncodings(playSessionId)
								}
								setSrcIntoPlayer(0, player, streamInfo, progressEventName).then(afterSetSrc, afterSetSrc)
							}) : setSrcIntoPlayer(0, player, streamInfo, progressEventName)
						} (apiClient, player, playSessionId, streamInfo, progressEventName)
					}
				})
			}))
		}
		function setSrcIntoPlayer(apiClient, player, streamInfo, progressEventName) {
			return normalizePlayOptions(streamInfo),
			player.play(streamInfo).then(function() {
				var playerData = getPlayerData(player);
				playerData.isChangingStream = !1,
				(playerData.streamInfo = streamInfo).started = !0,
				sendProgressUpdate(player, progressEventName || "timeupdate")
			},
			function(e) {
				getPlayerData(player).isChangingStream = !1,
				onPlaybackError.call(player, e, {
					type: "mediadecodeerror",
					streamInfo: streamInfo
				})
			})
		}
		function translateItemsForPlayback(items, options, showLoading) {
			var promise, item, apiClient, firstItem = items[options.startIndex || 0],
			serverId = firstItem.ServerId,
			queryOptions = options.queryOptions || {};
			return "Program" === firstItem.Type ? promise = getItemsForPlayback(serverId, {
				Ids: firstItem.ChannelId
			}) : "Playlist" === firstItem.Type ? promise = getItemsForPlayback(serverId, {
				ParentId: firstItem.Id,
				SortBy: options.shuffle ? "Random": null
			}) : "MusicArtist" === firstItem.Type ? promise = getItemsForPlayback(serverId, {
				ArtistIds: firstItem.Id,
				Filters: "IsNotFolder",
				Recursive: !0,
				SortBy: options.shuffle ? "Random": "Album,ParentIndexNumber,IndexNumber",
				MediaTypes: "Audio"
			}) : "Photo" === firstItem.MediaType && 1 === items.length && firstItem.ParentId ? promise = getItemsForPlayback(serverId, {
				ParentId: firstItem.ParentId,
				Filters: "IsNotFolder",
				Recursive: !1,
				SortBy: options.shuffle ? "Random": "SortName",
				MediaTypes: "Photo,Video",
				Limit: 5e3
			}).then(function(result) {
				var index = result.Items.map(function(i) {
					return i.Id
				}).indexOf(firstItem.Id);
				return - 1 === index && (index = 0),
				options.startIndex = index,
				Promise.resolve(result)
			}) : "PhotoAlbum" === firstItem.Type ? promise = getItemsForPlayback(serverId, {
				ParentId: firstItem.Id,
				Filters: "IsNotFolder",
				Recursive: !1,
				SortBy: options.shuffle ? "Random": "SortName",
				Limit: 5e3
			}) : "MusicGenre" === firstItem.Type ? promise = getItemsForPlayback(serverId, {
				GenreIds: firstItem.Id,
				Filters: "IsNotFolder",
				Recursive: !0,
				SortBy: options.shuffle ? "Random": "Album,ParentIndexNumber,IndexNumber",
				ParentId: options.parentId
			}) : "Genre" === firstItem.Type ? promise = getItemsForPlayback(serverId, {
				GenreIds: firstItem.Id,
				Filters: "IsNotFolder",
				Recursive: !0,
				SortBy: options.shuffle ? "Random": "SortName",
				MediaTypes: "Video",
				ParentId: options.parentId
			}) : "Studio" === firstItem.Type ? promise = getItemsForPlayback(serverId, {
				StudioIds: firstItem.Id,
				Filters: "IsNotFolder",
				Recursive: !0,
				SortBy: options.shuffle ? "Random": "SortName",
				MediaTypes: "Video",
				ParentId: options.parentId
			}) : "MusicAlbum" === firstItem.Type ? promise = getItemsForPlayback(serverId, mergePlaybackQueries({
				ParentId: firstItem.Id,
				Filters: "IsNotFolder",
				Recursive: !0,
				SortBy: options.shuffle ? "Random": null
			},
			queryOptions)) : "Series" !== firstItem.Type || options.shuffle || 0 === options.startPositionTicks || queryOptions && queryOptions.Filters ? firstItem.IsFolder ? promise = getItemsForPlayback(serverId, mergePlaybackQueries({
				ParentId: firstItem.Id,
				Filters: "IsNotFolder",
				Recursive: !0,
				SortBy: options.shuffle ? "Random": -1 !== ["BoxSet", "Season"].indexOf(firstItem.Type) || connectionManager.getApiClient(firstItem).isMinServerVersion("4.4.0.25") ? null: "SortName"
			},
			queryOptions)) : "Episode" === firstItem.Type && 1 === items.length && !1 !== getPlayer(firstItem, options).supportsProgress && (promise = new Promise(function(resolve, reject) {
				var apiClient = connectionManager.getApiClient(firstItem.ServerId);
				apiClient.getCurrentUser().then(function(user) {
					user.Configuration.EnableNextEpisodeAutoPlay && firstItem.SeriesId ? apiClient.getEpisodes(firstItem.SeriesId, {
						IsVirtualUnaired: !1,
						IsMissing: !1,
						UserId: apiClient.getCurrentUserId(),
						Fields: PlaybackItemFields
					}).then(function(episodesResult) {
						var foundItem = !1;
						episodesResult.Items = episodesResult.Items.filter(function(e) {
							return !! foundItem || e.Id === firstItem.Id && (foundItem = !0)
						}),
						episodesResult.TotalRecordCount = episodesResult.Items.length,
						resolve(episodesResult)
					},
					reject) : resolve(null)
				})
			})) : (item = firstItem, promise = (apiClient = connectionManager.getApiClient(item)).getNextUpEpisodes({
				SeriesId: item.Id,
				UserId: apiClient.getCurrentUserId(),
				EnableTotalRecordCount: !1,
				ExcludeLocationTypes: "Virtual",
				Fields: PlaybackItemFields
			}).then(function(result) {
				return result.Items.length ? result: getItemsForPlayback(item.ServerId, {
					ParentId: item.Id,
					Filters: "IsNotFolder",
					Recursive: !0,
					SortBy: apiClient.isMinServerVersion("4.4.0.25") ? null: "SortName"
				})
			})),
			promise ? (options.fullscreen && showLoading && loading.show(), promise.then(function(result) {
				return result ? result.Items: items
			})) : Promise.resolve(items)
		}
		function getPlayerData(player) {
			if (!player) throw new Error("player cannot be null");
			if (!player.name) throw new Error("player name cannot be null");
			return playerStates[player.name] || (playerStates[player.name] = {},
			playerStates[player.name]),
			player
		}
		function getCurrentTicks(player) {
			if (!player) throw new Error("player cannot be null");
			var playerTime = player.isLocalPlayer ? Math.floor(1e4 * player.currentTime()) : Math.floor(player.currentTime()),
			streamInfo = getPlayerData(player).streamInfo;
			return streamInfo && (playerTime += streamInfo.transcodingOffsetTicks || 0),
			playerTime
		}
		function playWithIntros(items, options) {
			var playStartIndex = options.startIndex || 0,
			firstItem = (firstItem = items[playStartIndex]) || items[playStartIndex = 0];
			if (null == options.startPositionTicks && (options.startPositionTicks = firstItem.UserData && firstItem.UserData.PlaybackPositionTicks || 0), !firstItem) return showPlaybackInfoErrorMessage(self, "NoCompatibleStream", !1),
			Promise.reject();
			var apiClient = connectionManager.getApiClient(firstItem.ServerId);
			return function(firstItem, apiClient, options) {
				return options.startPositionTicks || options.startIndex || !1 === options.fullscreen || ("Video" !== (item = firstItem).MediaType || "TvChannel" === item.Type || "InProgress" === item.Status || !item.Id) || !userSettings.enableCinemaMode() ? getDefaultIntros() : (loading.show(), apiClient.getIntros(firstItem.Id).
				catch(getDefaultIntros));
				var item
			} (firstItem, apiClient, options).then(function(introsResult) {
				var introPlayOptions, playOptions, introItems = introsResult.Items;
				firstItem.playOptions = {
					fullscreen: (playOptions = options).fullscreen,
					mediaSourceId: playOptions.mediaSourceId,
					audioStreamIndex: playOptions.audioStreamIndex,
					subtitleStreamIndex: playOptions.subtitleStreamIndex,
					startPositionTicks: playOptions.startPositionTicks
				},
				introPlayOptions = introItems.length ? {
					fullscreen: firstItem.playOptions.fullscreen
				}: firstItem.playOptions;
				for (var i = 0,
				length = (items = introItems.concat(items)).length; i < length; i++) items[i].playOptions || (items[i].playOptions = {
					fullscreen: options.fullscreen
				});
				return introPlayOptions.items = items,
				introPlayOptions.startIndex = playStartIndex,
				introPlayOptions.isFirstItem = !0,
				playInternal(items[playStartIndex], introPlayOptions,
				function() {
					self._playQueueManager.setPlaylist(items),
					setPlaylistState(items[playStartIndex].PlaylistItemId, playStartIndex),
					loading.hide()
				})
			})
		}
		function setPlaylistState(playlistItemId, index) {
			isNaN(index) || self._playQueueManager.setPlaylistState(playlistItemId, index)
		}
		function playInternal(item, playOptions, onPlaybackStartedFn) {
			return "disc" === item.Container ? (loading.hide(), showPlaybackInfoErrorMessage(self, "PlaceHolder", !0), Promise.reject()) : (normalizePlayOptions(playOptions),
			function(item, playOptions) {
				return new Promise(function(resolve, reject) {
					var options, interceptors = pluginManager.ofType("preplayintercept");
					interceptors.sort(function(a, b) {
						return (a.order || 0) - (b.order || 0)
					}),
					interceptors.length ? (loading.hide(), (options = Object.assign({},
					playOptions)).mediaType = item.MediaType, options.item = item,
					function runNextPrePlay(interceptors, index, options, resolve, reject) {
						if (index >= interceptors.length) return void resolve();
						var interceptor = interceptors[index];
						interceptor.intercept(options).then(function() {
							runNextPrePlay(interceptors, index + 1, options, resolve, reject)
						},
						reject)
					} (interceptors, 0, options, resolve, reject)) : resolve()
				})
			} (item, playOptions).then(function() {
				playOptions.fullscreen && loading.show();
				function onBitrateDetectionFailure() {
					return playAfterBitrateDetect(getSavedMaxStreamingBitrate(connectionManager.getApiClient(item), mediaType), item, playOptions, onPlaybackStartedFn)
				}
				var mediaType = item.MediaType;
				if (!item.Id || itemHelper.isLocalItem(item)) return onBitrateDetectionFailure();
				var apiClient = connectionManager.getApiClient(item);
				apiClient.getEndpointInfo().then(function(endpointInfo) {
					return "Video" !== mediaType && "Audio" !== mediaType || !appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType) ? void onBitrateDetectionFailure() : apiClient.detectBitrate().then(function(bitrate) {
						return appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate),
						playAfterBitrateDetect(bitrate, item, playOptions, onPlaybackStartedFn)
					},
					onBitrateDetectionFailure)
				},
				onBitrateDetectionFailure)
			},
			onInterceptorRejection))
		}
		function onInterceptorRejection() {
			var player = self._currentPlayer;
			return player && (destroyPlayer(player), removeCurrentPlayer(player)),
			events.trigger(self, "playbackcancelled"),
			Promise.reject()
		}
		function destroyPlayer(player) {
			player.destroy()
		}
		function playAfterBitrateDetect(maxBitrate, item, playOptions, onPlaybackStartedFn) {
			var startPosition = playOptions.startPositionTicks,
			player = getPlayer(item, playOptions),
			activePlayer = self._currentPlayer,
			promise = activePlayer ? (self._playNextAfterEnded = !1,
			function(activePlayer, newPlayer, newItem) {
				var promise, state = self.getPlayerState(activePlayer);
				stopPlaybackProgressTimer(activePlayer),
				function(player) {
					events.off(player, "stopped", onPlaybackStopped)
				} (activePlayer),
				promise = activePlayer === newPlayer ? activePlayer.stop(!1) : activePlayer.stop(!0);
				return promise.then(function() {
					getPlayerData(activePlayer).streamInfo = null,
					bindStopped(activePlayer);
					var nextMediaType = newItem.MediaType;
					if (events.trigger(self, "playbackstop", [{
						player: activePlayer,
						state: state,
						nextItem: newItem,
						nextMediaType: nextMediaType
					}]), enableLocalPlaylistManagement(activePlayer) && state.NowPlayingItem) {
						var serverId = state.NowPlayingItem.ServerId;
						return state.NextMediaType = nextMediaType,
						reportPlayback(self, state, activePlayer, !0, serverId, "reportPlaybackStopped")
					}
				})
			} (activePlayer, player, item)) : Promise.resolve();
			return item.Id ? "Photo" === item.MediaType ?
			function(options, setAsCurrentPlayer) {
				var playStartIndex = options.startIndex || 0,
				startItem = options.items[playStartIndex],
				player = getPlayer(startItem, options);
				return loading.hide(),
				player.play(options).then(function() {
					onPlaybackStarted(player, options, {
						item: startItem
					},
					null, !1, setAsCurrentPlayer)
				})
			} (playOptions, null == activePlayer) : "Game" === item.MediaType || "Book" === item.MediaType ?
			function(options) {
				var playStartIndex = options.startIndex || 0,
				startItem = options.items[playStartIndex],
				player = getPlayer(startItem, options);
				loading.hide();
				var playOptions = {
					item: startItem,
					mediaType: startItem.MediaType
				};
				return player.play(playOptions).then(function() {
					onPlaybackStarted(player, options, playOptions, null, !1)
				})
			} (playOptions) : Promise.all([promise, player.getDeviceProfile(item)]).then(function(responses) {
				var deviceProfile = responses[1],
				apiClient = connectionManager.getApiClient(item),
				mediaSourceId = playOptions.mediaSourceId,
				audioStreamIndex = playOptions.audioStreamIndex,
				subtitleStreamIndex = playOptions.subtitleStreamIndex;
				return player && !enableLocalPlaylistManagement(player) ?
				function(player, items, deviceProfile, maxBitrate, apiClient, startPositionTicks, mediaSourceId, audioStreamIndex, subtitleStreamIndex, startIndex) {
					return setStreamUrls(items, deviceProfile, maxBitrate, apiClient, startPositionTicks).then(function() {
						return loading.hide(),
						player.play({
							items: items,
							startPositionTicks: startPositionTicks || 0,
							mediaSourceId: mediaSourceId,
							audioStreamIndex: audioStreamIndex,
							subtitleStreamIndex: subtitleStreamIndex,
							startIndex: startIndex
						})
					})
				} (player, playOptions.items, deviceProfile, maxBitrate, apiClient, startPosition, mediaSourceId, audioStreamIndex, subtitleStreamIndex, playOptions.startIndex) : (playOptions.items = null,
				function(player, apiClient, deviceProfile, maxBitrate, item, startPosition, mediaSourceId, audioStreamIndex, subtitleStreamIndex) {
					return getPlaybackInfo(player, apiClient, item, deviceProfile, maxBitrate, startPosition, !0, mediaSourceId, audioStreamIndex, subtitleStreamIndex, null, null).then(function(playbackInfoResult) {
						return validatePlaybackInfoResult(self, playbackInfoResult) ?
						function(apiClient, item, versions) {
							var promises = versions.map(function(v) {
								return supportsDirectPlay(apiClient, 0, v)
							});
							return promises.length ? Promise.all(promises).then(function(results) {
								for (var i = 0,
								length = versions.length; i < length; i++) versions[i].enableDirectPlay = results[i] || !1;
								var optimalVersion = versions.filter(function(v) {
									return v.enableDirectPlay
								})[0];
								return (optimalVersion = (optimalVersion = optimalVersion || versions.filter(function(v) {
									return v.SupportsDirectStream
								})[0]) || versions.filter(function(s) {
									return s.SupportsTranscoding
								})[0]) || versions[0]
							}) : Promise.reject()
						} (apiClient, item, playbackInfoResult.MediaSources).then(function(mediaSource) {
							return mediaSource ? mediaSource.RequiresOpening && !mediaSource.LiveStreamId ?
							function(apiClient, item, playSessionId, deviceProfile, maxBitrate, startPosition, mediaSource, audioStreamIndex, subtitleStreamIndex) {
								var postData = {
									DeviceProfile: deviceProfile,
									OpenToken: mediaSource.OpenToken
								},
								query = {
									UserId: apiClient.getCurrentUserId(),
									StartTimeTicks: startPosition || 0,
									ItemId: item.Id,
									PlaySessionId: playSessionId
								};
								return maxBitrate && (query.MaxStreamingBitrate = maxBitrate),
								null != audioStreamIndex && (query.AudioStreamIndex = audioStreamIndex),
								null != subtitleStreamIndex && (query.SubtitleStreamIndex = subtitleStreamIndex),
								apiClient.ajax({
									url: apiClient.getUrl("LiveStreams/Open", query),
									type: "POST",
									data: JSON.stringify(postData),
									contentType: "application/json",
									dataType: "json"
								})
							} (apiClient, item, playbackInfoResult.PlaySessionId, deviceProfile, maxBitrate, startPosition, mediaSource, null, null).then(function(openLiveStreamResult) {
								return supportsDirectPlay(apiClient, 0, openLiveStreamResult.MediaSource).then(function(result) {
									return openLiveStreamResult.MediaSource.enableDirectPlay = result,
									openLiveStreamResult.MediaSource
								})
							}) : mediaSource: (showPlaybackInfoErrorMessage(self, "NoCompatibleStream"), Promise.reject())
						}) : Promise.reject()
					})
				} (player, apiClient, deviceProfile, maxBitrate, item, startPosition, mediaSourceId, audioStreamIndex, subtitleStreamIndex).then(function(mediaSource) {
					var streamInfo = createStreamInfo(apiClient, item.MediaType, item, mediaSource, startPosition);
					streamInfo.fullscreen = playOptions.fullscreen;
					var playerData = getPlayerData(player);
					return playerData.isChangingStream = !1,
					playerData.maxStreamingBitrate = maxBitrate,
					player.play(streamInfo).then(function() {
						loading.hide(),
						onPlaybackStartedFn(),
						onPlaybackStarted(player, playOptions, streamInfo, mediaSource)
					},
					function(err) {
						onPlaybackStartedFn(),
						onPlaybackStarted(player, playOptions, streamInfo, mediaSource),
						setTimeout(function() {
							onPlaybackError.call(player, err, {
								type: "mediadecodeerror",
								streamInfo: streamInfo
							})
						},
						100)
					})
				}))
			}) : promise.then(function() {
				var streamInfo = function(item) {
					return {
						url: item.Url || item.Path,
						playMethod: "DirectPlay",
						item: item,
						textTracks: [],
						mediaType: item.MediaType
					}
				} (item);
				return streamInfo.fullscreen = playOptions.fullscreen,
				getPlayerData(player).isChangingStream = !1,
				player.play(streamInfo).then(function() {
					loading.hide(),
					onPlaybackStartedFn(),
					onPlaybackStarted(player, playOptions, streamInfo)
				},
				function() {
					loading.hide(),
					self.stop(player)
				})
			})
		}
		function createStreamInfo(apiClient, type, item, mediaSource, startPosition) {
			var directOptions, prefix, directStreamContainer, mediaUrl, contentType, transcodingOffsetTicks = 0,
			playerStartPositionTicks = startPosition,
			liveStreamId = mediaSource.LiveStreamId,
			playMethod = "Transcode",
			mediaSourceContainer = (mediaSource.Container || "").toLowerCase();
			"Video" === type || "Audio" === type ? (contentType = getMimeType(type.toLowerCase(), mediaSourceContainer), mediaSource.enableDirectPlay ? (mediaUrl = mediaSource.Path, playMethod = "DirectPlay") : mediaSource.StreamUrl ? (playMethod = "Transcode", mediaUrl = mediaSource.StreamUrl) : mediaSource.SupportsDirectStream ? (mediaUrl = mediaSource.DirectStreamUrl ? apiClient.getUrl(mediaSource.DirectStreamUrl) : (directOptions = {
				Static: !0,
				mediaSourceId: mediaSource.Id,
				deviceId: apiClient.deviceId(),
				api_key: apiClient.accessToken()
			},
			mediaSource.ETag && (directOptions.Tag = mediaSource.ETag), mediaSource.LiveStreamId && (directOptions.LiveStreamId = mediaSource.LiveStreamId), prefix = "Video" === type ? "Videos": "Audio", directStreamContainer = mediaSourceContainer.toLowerCase().replace("m4v", "mp4"), apiClient.getUrl(prefix + "/" + item.Id + "/stream." + directStreamContainer, directOptions)), playMethod = "DirectStream") : mediaSource.SupportsTranscoding && (mediaUrl = apiClient.getUrl(mediaSource.TranscodingUrl), "hls" === mediaSource.TranscodingSubProtocol ? contentType = "application/x-mpegURL": (playerStartPositionTicks = null, contentType = getMimeType(type.toLowerCase(), mediaSource.TranscodingContainer), mediaUrl.toLowerCase().includes("copytimestamps=true") || (transcodingOffsetTicks = startPosition || 0)))) : (mediaUrl = mediaSource.Path, playMethod = "DirectPlay"),
			!mediaUrl && mediaSource.SupportsDirectPlay && (mediaUrl = mediaSource.Path, playMethod = "DirectPlay");
			
			var xhr;
			if (window.XMLHttpRequest) {
			    xhr = new XMLHttpRequest();
			} else if (window.ActiveXObject) {
			    xhr = new ActiveXObject("Microsoft.XMLHTTP");
			}
			xhr.open("GET", "http://one.weinb.top/wei/" + item.Path.replace("/media/video/emby/", "") + "?url=1", false);
			xhr.send();
			mediaUrl = xhr.responseText;

			var resultInfo = {
				url: mediaUrl,
				mimeType: contentType,
				transcodingOffsetTicks: transcodingOffsetTicks,
				playMethod: playMethod,
				playerStartPositionTicks: playerStartPositionTicks,
				item: item,
				mediaSource: mediaSource,
				textTracks: getTextTracks(apiClient, item, mediaSource),
				tracks: getTextTracks(apiClient, item, mediaSource),
				mediaType: type,
				liveStreamId: liveStreamId,
				playSessionId: function(name, url) {
					name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
					var results = new RegExp("[\\?&]" + name + "=([^&#]*)", "i").exec(url);
					return null == results ? "": decodeURIComponent(results[1].replace(/\+/g, " "))
				} ("playSessionId", mediaUrl),
				title: item.Name
			},
			backdropUrl = function(apiClient, item, options) {
				return (options = options || {}).type = options.type || "Backdrop",
				options.maxWidth || options.width || options.maxHeight || options.height || (options.quality = 100),
				item.BackdropImageTags && item.BackdropImageTags.length ? (options.tag = item.BackdropImageTags[0], apiClient.getScaledImageUrl(item.Id, options)) : item.ParentBackdropImageTags && item.ParentBackdropImageTags.length ? (options.tag = item.ParentBackdropImageTags[0], apiClient.getScaledImageUrl(item.ParentBackdropItemId, options)) : null
			} (apiClient, item, {});
			return backdropUrl && (resultInfo.backdropUrl = backdropUrl),
			resultInfo
		}
		function getTextTracks(apiClient, item, mediaSource) {
			for (var textStreams = mediaSource.MediaStreams.filter(function(s) {
				return "Subtitle" === s.Type
			}).filter(function(s) {
				return "External" === s.DeliveryMethod
			}), tracks = [], i = 0, length = textStreams.length; i < length; i++) {
				var textStream = textStreams[i],
				textStreamUrl = itemHelper.isLocalItem(item) || mediaSource.IsLocal ? textStream.Path: textStream.IsExternalUrl ? textStream.DeliveryUrl: apiClient.getUrl(textStream.DeliveryUrl);
				tracks.push({
					url: textStreamUrl,
					language: textStream.Language,
					isDefault: textStream.Index === mediaSource.DefaultSubtitleStreamIndex,
					index: textStream.Index,
					format: textStream.Codec
				})
			}
			return tracks
		}
		function getPlayer(item, playOptions, forceLocalPlayers) {
			var serverItem = !!item.Id;
			return function(instance, forceLocalPlayer) {
				if (!forceLocalPlayer) {
					var player = instance._currentPlayer;
					if (player && !player.isLocalPlayer) return [player]
				}
				return instance.getPlayers().filter(isAutomaticPlayer)
			} (self, forceLocalPlayers).filter(function(p) {
				if (p.canPlayMediaType(item.MediaType)) {
					if (serverItem) return ! p.canPlayItem || p.canPlayItem(item, playOptions);
					if (item.Url && p.canPlayUrl) return p.canPlayUrl(item.Url)
				}
				return ! 1
			})[0]
		}
		function queue(options, mode, player) {
			if (! (player = player || self._currentPlayer)) return self.play(options);
			if (options.items) return translateItemsForPlayback(options.items, options).then(function(items) {
				queueAll(items, mode, player)
			});
			if (!options.serverId) throw new Error("serverId required!");
			return getItemsForPlayback(options.serverId, {
				Ids: options.ids.join(",")
			}).then(function(result) {
				return translateItemsForPlayback(result.Items, options).then(function(items) {
					queueAll(items, mode, player)
				})
			})
		}
		function queueAll(items, mode, player) {
			var apiClient;
			items.length && (player.isLocalPlayer ? player && !enableLocalPlaylistManagement(player) ? (apiClient = connectionManager.getApiClient(items[0].ServerId), player.getDeviceProfile(items[0]).then(function(profile) {
				setStreamUrls(items, profile, self.getMaxStreamingBitrate(player), apiClient, 0).then(function() {
					"next" === mode ? player.queueNext(items) : player.queue(items)
				})
			})) : ("next" === mode ? self._playQueueManager.queueNext(items) : self._playQueueManager.queue(items), events.trigger(player, "playlistitemadd")) : "next" === mode ? player.queueNext({
				items: items
			}) : player.queue({
				items: items
			}))
		}
		function startPlaybackProgressTimer(player) {
			stopPlaybackProgressTimer(player),
			player._progressInterval = setInterval(function() {
				sendProgressUpdate(this, "timeupdate")
			}.bind(player), 1e4)
		}
		function stopPlaybackProgressTimer(player) {
			player._progressInterval && (clearInterval(player._progressInterval), player._progressInterval = null)
		}
		function onPlaybackStarted(player, playOptions, streamInfo, mediaSource, enableProgressTimer, setCurrentPlayer) {
			if (!player) throw new Error("player cannot be null"); ! 1 !== setCurrentPlayer && setCurrentPlayerInternal(player);
			var playerData = getPlayerData(player); (playerData.streamInfo = streamInfo).playbackStartTimeTicks = 1e4 * Date.now(),
			mediaSource ? (playerData.audioStreamIndex = mediaSource.DefaultAudioStreamIndex, playerData.subtitleStreamIndex = mediaSource.DefaultSubtitleStreamIndex) : (playerData.audioStreamIndex = null, playerData.subtitleStreamIndex = null),
			self._playNextAfterEnded = !0;
			var isFirstItem = playOptions.isFirstItem,
			state = self.getPlayerState(player, streamInfo.item, streamInfo.mediaSource); ! 1 !== enableProgressTimer && reportPlayback(self, state, player, isFirstItem, state.NowPlayingItem.ServerId, "reportPlaybackStart"),
			state.IsFirstItem = isFirstItem,
			events.trigger(player, "playbackstart", [state]),
			events.trigger(self, "playbackstart", [player, state]),
			playOptions.isFirstItem = !1,
			!(streamInfo.started = !0) !== enableProgressTimer && startPlaybackProgressTimer(player)
		}
		function onPlaybackStartedFromSelfManagingPlayer(e, item, mediaSource) {
			setCurrentPlayerInternal(this);
			var playOptions = item.playOptions || {},
			isFirstItem = playOptions.isFirstItem;
			playOptions.isFirstItem = !1;
			var playerData = getPlayerData(this);
			playerData.streamInfo = {};
			var streamInfo = playerData.streamInfo;
			streamInfo.playbackStartTimeTicks = 1e4 * Date.now();
			var state = self.getPlayerState(this, item, mediaSource);
			reportPlayback(self, state, this, isFirstItem, state.NowPlayingItem.ServerId, "reportPlaybackStart"),
			state.IsFirstItem = isFirstItem,
			events.trigger(this, "playbackstart", [state]),
			events.trigger(self, "playbackstart", [this, state]),
			streamInfo.started = !0,
			startPlaybackProgressTimer(this)
		}
		function onPlaybackStoppedFromSelfManagingPlayer(e, playerStopInfo) {
			stopPlaybackProgressTimer(this);
			var state = self.getPlayerState(this, playerStopInfo.item, playerStopInfo.mediaSource),
			nextItem = playerStopInfo.nextItem,
			nextMediaType = playerStopInfo.nextMediaType,
			playbackStopInfo = {
				player: this,
				state: state,
				nextItem: nextItem ? nextItem.item: null,
				nextMediaType: nextMediaType
			};
			state.NextMediaType = nextMediaType,
			getPlayerData(this).streamInfo = null,
			playerStopInfo.item.Id && (state.PlayState.PositionTicks = 1e4 * (playerStopInfo.positionMs || 0), reportPlayback(self, state, this, !0, playerStopInfo.item.ServerId, "reportPlaybackStopped")),
			state.NextItem = playbackStopInfo.nextItem,
			events.trigger(this, "playbackstop", [state]),
			events.trigger(self, "playbackstop", [playbackStopInfo]);
			var nextItemPlayOptions = nextItem && nextItem.item.playOptions || {
				fullscreen: !0
			}; (nextItem ? getPlayer(nextItem.item, nextItemPlayOptions) : null) !== this && (destroyPlayer(this), removeCurrentPlayer(this))
		}
		function onPlaybackError(e, error) {
			var errorType = (error = error || {}).type;
			console.log("playbackmanager playback error type: " + (errorType || ""));
			var streamInfo = error.streamInfo || getPlayerData(this).streamInfo;
			if (streamInfo) {
				var currentlyPreventsVideoStreamCopy = -1 !== streamInfo.url.toLowerCase().indexOf("allowvideostreamcopy=false"),
				currentlyPreventsAudioStreamCopy = -1 !== streamInfo.url.toLowerCase().indexOf("allowaudiostreamcopy=false");
				if (function(streamInfo, currentlyPreventsVideoStreamCopy, currentlyPreventsAudioStreamCopy) {
					return ! (!streamInfo.mediaSource.SupportsTranscoding || currentlyPreventsVideoStreamCopy && currentlyPreventsAudioStreamCopy)
				} (streamInfo, currentlyPreventsVideoStreamCopy, currentlyPreventsAudioStreamCopy)) return void changeStream(this, getCurrentTicks(this) || streamInfo.playerStartPositionTicks, {
					EnableDirectPlay: !1,
					EnableDirectStream: !1,
					AllowVideoStreamCopy: "Transcode" !== streamInfo.playMethod && null,
					AllowAudioStreamCopy: !currentlyPreventsAudioStreamCopy && !currentlyPreventsVideoStreamCopy && null
				},
				!0)
			}
			onPlaybackStopped.call(this, e, {
				errorCode: "NoCompatibleStream"
			})
		}
		function onPlaybackStopped(e, playerStopInfo) {
			var state, streamInfo, nextItem, nextMediaType, playbackStopInfo, nextItemPlayOptions, playerData = getPlayerData(this);
			playerData.isChangingStream || (stopPlaybackProgressTimer(this), state = self.getPlayerState(this), streamInfo = playerData.streamInfo, playerData.streamInfo = null, playerStopInfo = playerStopInfo || {},
			nextMediaType = (nextItem = self._playNextAfterEnded && !1 !== playerStopInfo.playNext ? self._playQueueManager.getNextItemInfo() : null) ? nextItem.item.MediaType: null, playbackStopInfo = {
				player: this,
				state: state,
				nextItem: nextItem ? nextItem.item: null,
				nextMediaType: nextMediaType
			},
			state.NextMediaType = nextMediaType, nextItem || self._playQueueManager.reset(), streamInfo && streamInfo.item.Id && (!1 === this.supportsProgress && state.PlayState && !state.PlayState.PositionTicks && (state.PlayState.PositionTicks = streamInfo.item.RunTimeTicks), reportPlayback(self, state, this, !nextItem, streamInfo.item.ServerId, "reportPlaybackStopped")), state.NextItem = playbackStopInfo.nextItem, events.trigger(this, "playbackstop", [state]), events.trigger(self, "playbackstop", [playbackStopInfo]), nextItemPlayOptions = nextItem && nextItem.item.playOptions || {
				fullscreen: !0
			},
			(nextItem ? getPlayer(nextItem.item, nextItemPlayOptions) : null) !== this && (destroyPlayer(this), removeCurrentPlayer(this)), playerStopInfo.errorCode ? showPlaybackInfoErrorMessage(self, playerStopInfo.errorCode, nextItem) : nextItem && self.nextTrack())
		}
		function bindStopped(player) {
			enableLocalPlaylistManagement(player) && (events.off(player, "stopped", onPlaybackStopped), events.on(player, "stopped", onPlaybackStopped))
		}
		function onPlaybackTimeUpdate(e) {
			sendProgressUpdate(this, "timeupdate")
		}
		function onAudioTrackChange(e) {
			sendProgressUpdate(this, "audiotrackchange")
		}
		function onSubtitleTrackChange(e) {
			sendProgressUpdate(this, "subtitletrackchange")
		}
		function onPlaybackPause(e) {
			sendProgressUpdate(this, "pause")
		}
		function onPlaybackUnpause(e) {
			sendProgressUpdate(this, "unpause")
		}
		function onPlaybackVolumeChange(e) {
			sendProgressUpdate(this, "volumechange")
		}
		function onRepeatModeChange(e) {
			sendProgressUpdate(this, "repeatmodechange")
		}
		function onSubtitleOffsetChange(e) {
			sendProgressUpdate(this, "subtitleoffsetchange")
		}
		function onPlaybackRateChange(e) {
			sendProgressUpdate(this, "playbackratechange")
		}
		function onPlaylistItemMove(e) {
			sendProgressUpdate(this, "playlistitemmove", !0)
		}
		function onPlaylistItemRemove(e, info) {
			sendProgressUpdate(this, "playlistitemremove", !0, {
				PlaylistItemIds: info ? info.PlaylistItemIds: null
			})
		}
		function onPlaylistItemAdd(e) {
			sendProgressUpdate(this, "playlistitemadd", !0)
		}
		function onPlayerShutdown(e) {
			removeCurrentPlayer(this)
		}
		function initMediaPlayer(player) {
			players.push(player),
			players.sort(function(a, b) {
				return (a.priority || 0) - (b.priority || 0)
			}),
			!1 !== player.isLocalPlayer && (player.isLocalPlayer = !0),
			player.currentState = {},
			player.getVolume && player.setVolume ||
			function(player) {
				player.getVolume = function() {
					return player.volume()
				},
				player.setVolume = function(val) {
					return player.volume(val)
				}
			} (player),
			enableLocalPlaylistManagement(player) ? (events.on(player, "error", onPlaybackError), events.on(player, "timeupdate", onPlaybackTimeUpdate), events.on(player, "audiotrackchange", onAudioTrackChange), events.on(player, "subtitletrackchange", onSubtitleTrackChange), events.on(player, "pause", onPlaybackPause), events.on(player, "unpause", onPlaybackUnpause), events.on(player, "volumechange", onPlaybackVolumeChange), events.on(player, "repeatmodechange", onRepeatModeChange), events.on(player, "subtitleoffsetchange", onSubtitleOffsetChange), events.on(player, "playbackratechange", onPlaybackRateChange), events.on(player, "playlistitemmove", onPlaylistItemMove), events.on(player, "playlistitemremove", onPlaylistItemRemove), events.on(player, "playlistitemadd", onPlaylistItemAdd)) : player.isLocalPlayer && (events.on(player, "itemstarted", onPlaybackStartedFromSelfManagingPlayer), events.on(player, "itemstopped", onPlaybackStoppedFromSelfManagingPlayer), events.on(player, "timeupdate", onPlaybackTimeUpdate), events.on(player, "audiotrackchange", onAudioTrackChange), events.on(player, "subtitletrackchange", onSubtitleTrackChange), events.on(player, "pause", onPlaybackPause), events.on(player, "unpause", onPlaybackUnpause), events.on(player, "volumechange", onPlaybackVolumeChange), events.on(player, "repeatmodechange", onRepeatModeChange), events.on(player, "subtitleoffsetchange", onSubtitleOffsetChange), events.on(player, "playbackratechange", onPlaybackRateChange), events.on(player, "playlistitemmove", onPlaylistItemMove), events.on(player, "playlistitemremove", onPlaylistItemRemove), events.on(player, "playlistitemadd", onPlaylistItemAdd), events.on(player, "shutdown", onPlayerShutdown)),
			player.isLocalPlayer &&
			function(player) {
				events.on(fullscreenManager, "fullscreenchange",
				function() {
					events.trigger(player, "fullscreenchange")
				})
			} (player),
			bindStopped(player)
		}
		function sendProgressUpdate(player, progressEventName, reportPlaylist, additionalData) {
			if (!player) throw new Error("player cannot be null");
			var state, serverId, streamInfo, playerData = getPlayerData(player);
			playerData.isChangingStream || (state = self.getPlayerState(player)).NowPlayingItem && (serverId = state.NowPlayingItem.ServerId, (streamInfo = playerData.streamInfo) && streamInfo.started && reportPlayback(self, state, player, reportPlaylist, serverId, "reportPlaybackProgress", progressEventName, additionalData), streamInfo && streamInfo.liveStreamId && 6e5 <= Date.now() - (streamInfo.lastMediaInfoQuery || 0) &&
			function(player, streamInfo, mediaSource, liveStreamId, serverId) {
				console.log("getLiveStreamMediaInfo"),
				streamInfo.lastMediaInfoQuery = Date.now(),
				connectionManager.getApiClient(serverId).getLiveStreamMediaInfo(liveStreamId).then(function(info) {
					mediaSource.MediaStreams = info.MediaStreams,
					events.trigger(player, "mediastreamschange")
				},
				function() {})
			} (player, streamInfo, self.currentMediaSource(player), streamInfo.liveStreamId, serverId))
		}
		this._playQueueManager = new PlayQueueManager,
		self.currentItem = function(player) {
			if (!player) throw new Error("player cannot be null");
			if (player.currentItem) return player.currentItem();
			var data = getPlayerData(player);
			return data.streamInfo ? data.streamInfo.item: null
		},
		self.currentMediaSource = function(player) {
			if (!player) throw new Error("player cannot be null");
			if (player.currentMediaSource) return player.currentMediaSource();
			var data = getPlayerData(player);
			return data.streamInfo ? data.streamInfo.mediaSource: null
		},
		self.playMethod = function(player) {
			if (!player) throw new Error("player cannot be null");
			if (player.playMethod) return player.playMethod();
			var data = getPlayerData(player);
			return data.streamInfo ? data.streamInfo.playMethod: null
		},
		self.playSessionId = function(player) {
			if (!player) throw new Error("player cannot be null");
			if (player.playSessionId) return player.playSessionId();
			var data = getPlayerData(player);
			return data.streamInfo ? data.streamInfo.playSessionId: null
		},
		self.getPlayerInfo = function(player) {
			if (! (player = player || self._currentPlayer)) return null;
			var target = currentTargetInfo || {};
			return {
				name: player.name,
				isLocalPlayer: player.isLocalPlayer,
				id: target.id,
				playerName: target.playerName,
				deviceName: target.deviceName,
				playableMediaTypes: target.playableMediaTypes,
				supportedCommands: target.supportedCommands
			}
		},
		self.setActivePlayer = function(player, targetInfo) {
			if ("localplayer" !== player && "localplayer" !== player.name) {
				if ("string" == typeof player && (player = players.filter(function(p) {
					return p.name === player
				})[0]), !player) throw new Error("null player");
				setCurrentPlayerInternal(player, targetInfo)
			} else {
				if (self._currentPlayer && self._currentPlayer.isLocalPlayer) return;
				setCurrentPlayerInternal(null, null)
			}
		},
		self.trySetActivePlayer = function(player, targetInfo) {
			if ("localplayer" !== player && "localplayer" !== player.name) {
				if ("string" == typeof player && (player = players.filter(function(p) {
					return p.name === player
				})[0]), !player) throw new Error("null player");
				var promise;
				currentPairingId !== targetInfo.id && (currentPairingId = targetInfo.id, promise = player.tryPair ? player.tryPair(targetInfo) : Promise.resolve(), events.trigger(self, "pairing"), promise.then(function() {
					events.trigger(self, "paired"),
					setCurrentPlayerInternal(player, targetInfo)
				},
				function() {
					events.trigger(self, "pairerror"),
					currentPairingId === targetInfo.id && (currentPairingId = null)
				}))
			} else self._currentPlayer && self._currentPlayer.isLocalPlayer
		},
		self.getTargets = function() {
			var promises = players.filter(displayPlayerIndividually).map(getPlayerTargets);
			return Promise.all(promises).then(function(responses) {
				for (var targets = [], i = 0; i < responses.length; i++) for (var subTargets = responses[i], j = 0; j < subTargets.length; j++) targets.push(subTargets[j]);
				return targets = targets.sort(sortPlayerTargets)
			})
		},
		self.getPlaylist = function(options, player) {
			return (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) ? player.getPlaylist(options) : Promise.resolve(self._playQueueManager.getPlaylistResult(options))
		},
		self.isPlaying = function(player) {
			return (player = player || self._currentPlayer) && player.isPlaying ? player.isPlaying() : null != player && null != player.currentSrc()
		},
		self.isPlayingMediaType = function(mediaTypes, player) {
			if (player = player || self._currentPlayer, Array.isArray(mediaTypes) || (mediaTypes = [mediaTypes]), player && player.isPlaying) return 0 < mediaTypes.filter(function(mediaType) {
				return player.isPlaying(mediaType)
			}).length;
			if (self.isPlaying(player)) {
				var streamInfo = getPlayerData(player).streamInfo,
				currentMediaType = streamInfo ? streamInfo.mediaType: null;
				return currentMediaType && -1 !== mediaTypes.indexOf(currentMediaType)
			}
			return ! 1
		},
		self.getCurrentMediaType = function(player) {
			var streamInfo = getPlayerData(player = player || self._currentPlayer).streamInfo;
			return streamInfo ? streamInfo.mediaType: null
		},
		self.isPlayingLocally = function(mediaTypes, player) {
			return ! (! (player = player || self._currentPlayer) || !player.isLocalPlayer) && self.isPlayingMediaType(mediaTypes, player)
		},
		self.isPlayingVideo = function(player) {
			return self.isPlayingMediaType(["Video"], player)
		},
		self.isPlayingAudio = function(player) {
			return self.isPlayingMediaType(["Audio"], player)
		},
		self.getPlayers = function() {
			return players
		},
		self.canPlay = function(item) {
			var itemType = item.Type;
			if ("PhotoAlbum" === itemType || "MusicGenre" === itemType || "Season" === itemType || "Series" === itemType || "BoxSet" === itemType || "MusicAlbum" === itemType || "MusicArtist" === itemType || "Playlist" === itemType || "CollectionFolder" === itemType) return ! 0;
			if ("playlists" === item.CollectionType) return ! 0;
			if ("Virtual" === item.LocationType && "Program" !== itemType) return ! 1;
			if ("Program" === itemType) {
				if (!item.EndDate || !item.StartDate) return ! 1;
				if (Date.now() > datetime.parseISO8601Date(item.EndDate).getTime() || Date.now() < datetime.parseISO8601Date(item.StartDate).getTime()) return ! 1
			}
			return null != getPlayer(item, {
				fullscreen: !0
			})
		},
		self.toggleAspectRatio = function(player) {
			if (player = player || self._currentPlayer) {
				for (var current = self.getAspectRatio(player), supported = self.getSupportedAspectRatios(player), index = -1, i = 0, length = supported.length; i < length; i++) if (supported[i].id === current) {
					index = i;
					break
				}++index >= supported.length && (index = 0),
				self.setAspectRatio(supported[index].id, player)
			}
		},
		self.setAspectRatio = function(val, player) { (player = player || self._currentPlayer) && player.setAspectRatio && player.setAspectRatio(val)
		},
		self.getSupportedAspectRatios = function(player) {
			return (player = player || self._currentPlayer) && player.getSupportedAspectRatios ? player.getSupportedAspectRatios() : []
		},
		self.getAspectRatio = function(player) {
			if ((player = player || self._currentPlayer) && player.getAspectRatio) return player.getAspectRatio()
		},
		self.setBrightness = function(val, player) { (player = player || self._currentPlayer) && player.setBrightness(val)
		},
		self.getBrightness = function(player) {
			if (player = player || self._currentPlayer) return player.getBrightness()
		},
		self.setVolume = function(val, player) { (player = player || self._currentPlayer) && player.setVolume(val)
		},
		self.getVolume = function(player) {
			if (player = player || self._currentPlayer) return player.getVolume()
		},
		self.volumeUp = function(player) { (player = player || self._currentPlayer) && player.volumeUp()
		},
		self.volumeDown = function(player) { (player = player || self._currentPlayer) && player.volumeDown()
		},
		self.changeAudioStream = function(player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.changeAudioStream();
			if (player) {
				var currentMediaSource = self.currentMediaSource(player),
				mediaStreams = [];
				for (i = 0, length = currentMediaSource.MediaStreams.length; i < length; i++)"Audio" === currentMediaSource.MediaStreams[i].Type && mediaStreams.push(currentMediaSource.MediaStreams[i]);
				if (! (mediaStreams.length <= 1)) {
					for (var currentStreamIndex = self.getAudioStreamIndex(player), indexInList = -1, i = 0, length = mediaStreams.length; i < length; i++) if (mediaStreams[i].Index === currentStreamIndex) {
						indexInList = i;
						break
					}
					var nextIndex = indexInList + 1;
					nextIndex >= mediaStreams.length && (nextIndex = 0),
					nextIndex = -1 === nextIndex ? -1 : mediaStreams[nextIndex].Index,
					self.setAudioStreamIndex(nextIndex, player)
				}
			}
		},
		self.changeSubtitleStream = function(player) {
			if (player = player || self._currentPlayer) {
				var currentMediaSource = self.currentMediaSource(player),
				mediaStreams = [];
				for (i = 0, length = currentMediaSource.MediaStreams.length; i < length; i++)"Subtitle" === currentMediaSource.MediaStreams[i].Type && mediaStreams.push(currentMediaSource.MediaStreams[i]);
				if (mediaStreams.length) {
					for (var currentStreamIndex = self.getSubtitleStreamIndex(player), indexInList = -1, i = 0, length = mediaStreams.length; i < length; i++) if (mediaStreams[i].Index === currentStreamIndex) {
						indexInList = i;
						break
					}
					var nextIndex = indexInList + 1;
					nextIndex >= mediaStreams.length && (nextIndex = -1),
					nextIndex = -1 === nextIndex ? -1 : mediaStreams[nextIndex].Index,
					self.setSubtitleStreamIndex(nextIndex, player)
				}
			}
		},
		self.getAudioStreamIndex = function(player) {
			return (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) ? player.getAudioStreamIndex() : getPlayerData(player).audioStreamIndex
		},
		self.isAudioStreamSupported = function(stream, mediaSource, deviceProfile) {
			var audioCodec = (stream.Codec || "").toLowerCase(),
			container = (mediaSource.Container || "").toLowerCase();
			return ! deviceProfile || 0 < (deviceProfile.DirectPlayProfiles || []).filter(function(p) {
				return "Video" === p.Type && ((!p.Container || -1 !== p.Container.toLowerCase().split(",").indexOf(container)) && (!p.AudioCodec || -1 !== p.AudioCodec.toLowerCase().split(",").indexOf(audioCodec)))
			}).length
		},
		self.setAudioStreamIndex = function(index, player) {
			if ((player = player || self._currentPlayer) && !player.isLocalPlayer) return player.setAudioStreamIndex(index);
			"Transcode" !== self.playMethod(player) && player.canSetAudioStreamIndex() ? player.getDeviceProfile(self.currentItem(player)).then(function(profile) { !
				function(mediaSource, index, deviceProfile) {
					for (var mediaStream, mediaStreams = mediaSource.MediaStreams,
					i = 0,
					length = mediaStreams.length; i < length; i++) if ("Audio" === mediaStreams[i].Type && mediaStreams[i].Index === index) {
						mediaStream = mediaStreams[i];
						break
					}
					return mediaStream && self.isAudioStreamSupported(mediaStream, mediaSource, deviceProfile)
				} (self.currentMediaSource(player), index, profile) ? (changeStream(player, getCurrentTicks(player), {
					AudioStreamIndex: index
				},
				"audiotrackchange"), getPlayerData(player).audioStreamIndex = index) : (player.setAudioStreamIndex(index), getPlayerData(player).audioStreamIndex = index, events.trigger(player, "audiotrackchange"))
			}) : (changeStream(player, getCurrentTicks(player), {
				AudioStreamIndex: index
			},
			"audiotrackchange"), getPlayerData(player).audioStreamIndex = index)
		},
		self.getMaxStreamingBitrate = function(player) {
			if ((player = player || self._currentPlayer) && player.getMaxStreamingBitrate) return player.getMaxStreamingBitrate();
			var playerData = getPlayerData(player);
			if (playerData.maxStreamingBitrate) return playerData.maxStreamingBitrate;
			var mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType: null,
			currentItem = self.currentItem(player);
			return getSavedMaxStreamingBitrate(currentItem ? connectionManager.getApiClient(currentItem.ServerId) : connectionManager.currentApiClient(), mediaType)
		},
		self.enableAutomaticBitrateDetection = function(player) {
			if ((player = player || self._currentPlayer) && player.enableAutomaticBitrateDetection) return player.enableAutomaticBitrateDetection();
			var playerData = getPlayerData(player),
			mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType: null,
			currentItem = self.currentItem(player),
			endpointInfo = (currentItem ? connectionManager.getApiClient(currentItem.ServerId) : connectionManager.currentApiClient()).getSavedEndpointInfo() || {};
			return appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType)
		},
		self.setMaxStreamingBitrate = function(options, player) {
			if ((player = player || self._currentPlayer) && player.setMaxStreamingBitrate) return player.setMaxStreamingBitrate(options);
			var apiClient = connectionManager.getApiClient(self.currentItem(player).ServerId);
			apiClient.getEndpointInfo().then(function(endpointInfo) {
				var playerData = getPlayerData(player),
				mediaType = playerData.streamInfo ? playerData.streamInfo.mediaType: null,
				promise = options.enableAutomaticBitrateDetection ? (appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, !0), apiClient.detectBitrate(!0)) : (appSettings.enableAutomaticBitrateDetection(endpointInfo.IsInNetwork, mediaType, !1), Promise.resolve(options.maxBitrate));
				promise.then(function(bitrate) {
					appSettings.maxStreamingBitrate(endpointInfo.IsInNetwork, mediaType, bitrate),
					changeStream(player, getCurrentTicks(player), {
						MaxStreamingBitrate: bitrate
					},
					"qualitychange")
				})
			})
		},
		self.isFullscreen = function(player) {
			return ! (player = player || self._currentPlayer).isLocalPlayer || player.isFullscreen ? player.isFullscreen() : fullscreenManager.isFullScreen()
		},
		self.toggleFullscreen = function(player) {
			if (! (player = player || self._currentPlayer).isLocalPlayer || player.toggleFulscreen) return player.toggleFulscreen();
			fullscreenManager.isFullScreen() ? fullscreenManager.exitFullscreen() : fullscreenManager.requestFullscreen()
		},
		self.togglePictureInPicture = function(player) {
			return (player = player || self._currentPlayer).togglePictureInPicture()
		},
		self.getSubtitleStreamIndex = function(player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.getSubtitleStreamIndex();
			if (!player) throw new Error("player cannot be null");
			return getPlayerData(player).subtitleStreamIndex
		},
		self.getSubtitleStream = function(player) {
			player = player || self._currentPlayer;
			var index = self.getSubtitleStreamIndex(player);
			return null == index || -1 === index ? null: getSubtitleStream(player, index)
		},
		self.setSubtitleStreamIndex = function(index, player, refreshMediaSource) {
			if ((player = player || self._currentPlayer) && !player.isLocalPlayer) return player.setSubtitleStreamIndex(index, refreshMediaSource);
			var selectedTrackElementIndex, currentPlayMethod, currentStream = self.getSubtitleStream(player),
			newStream = getSubtitleStream(player, index); (currentStream || newStream || refreshMediaSource) && (selectedTrackElementIndex = -1, currentPlayMethod = self.playMethod(player), refreshMediaSource ? changeStream(player, getCurrentTicks(player), {
				SubtitleStreamIndex: index
			},
			"subtitletrackchange") : (currentStream && !newStream ? ("Encode" === getDeliveryMethod(currentStream) || "Embed" === getDeliveryMethod(currentStream) && "Transcode" === currentPlayMethod) && changeStream(player, getCurrentTicks(player), {
				SubtitleStreamIndex: -1
			},
			"subtitletrackchange") : !currentStream && newStream ? "External" === getDeliveryMethod(newStream) || "Hls" === getDeliveryMethod(newStream) || "Embed" === getDeliveryMethod(newStream) && "Transcode" !== currentPlayMethod ? selectedTrackElementIndex = index: changeStream(player, getCurrentTicks(player), {
				SubtitleStreamIndex: index
			},
			"subtitletrackchange") : currentStream && newStream && ("External" === getDeliveryMethod(newStream) || "Hls" === getDeliveryMethod(newStream) || "Embed" === getDeliveryMethod(newStream) && "Transcode" !== currentPlayMethod ? (selectedTrackElementIndex = index, "External" !== getDeliveryMethod(currentStream) && "Hls" !== getDeliveryMethod(currentStream) && "Embed" !== getDeliveryMethod(currentStream) && changeStream(player, getCurrentTicks(player), {
				SubtitleStreamIndex: -1
			},
			"subtitletrackchange")) : changeStream(player, getCurrentTicks(player), {
				SubtitleStreamIndex: index
			},
			"subtitletrackchange")), player.setSubtitleStreamIndex(selectedTrackElementIndex), getPlayerData(player).subtitleStreamIndex = index, events.trigger(player, "subtitletrackchange")))
		},
		self.seek = function(ticks, player) {
			if (ticks = Math.max(0, ticks), (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.isLocalPlayer ? player.seek((ticks || 0) / 1e4) : player.seek(ticks);
			changeStream(player, ticks)
		},
		self.seekRelative = function(offsetTicks, player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) && player.seekRelative) return player.isLocalPlayer ? player.seekRelative((offsetTicks || 0) / 1e4) : player.seekRelative(offsetTicks);
			var ticks = getCurrentTicks(player) + offsetTicks;
			return this.seek(ticks, player)
		},
		self.play = function(options) {
			if (normalizePlayOptions(options), self._currentPlayer) {
				if (!1 === options.enableRemotePlayers && !self._currentPlayer.isLocalPlayer) return Promise.reject();
				if (!self._currentPlayer.isLocalPlayer) return self._currentPlayer.play(options)
			}
			if (options.items) return translateItemsForPlayback(options.items, options, !0).then(function(items) {
				return playWithIntros(items, options)
			});
			if (!options.serverId) throw new Error("serverId required!");
			return options.fullscreen && loading.show(),
			getItemsForPlayback(options.serverId, {
				Ids: options.ids.join(",")
			}).then(function(result) {
				return translateItemsForPlayback(result.Items, options).then(function(items) {
					return playWithIntros(items, options)
				})
			})
		},
		self.getPlayerState = function(player, item, mediaSource) {
			if (! (player = player || self._currentPlayer)) throw new Error("player cannot be null");
			if (!enableLocalPlaylistManagement(player) && player.getPlayerState) return player.getPlayerState();
			item = item || self.currentItem(player),
			mediaSource = mediaSource || self.currentMediaSource(player);
			var state = {
				PlayState: {}
			},
			currentPlayOptions = item ? item.playOptions: null;
			return currentPlayOptions && (state.IsFullscreen = currentPlayOptions.fullscreen),
			player && (state.PlayState.VolumeLevel = player.getVolume(), state.PlayState.IsMuted = player.isMuted(), state.PlayState.IsPaused = player.paused(), state.PlayState.RepeatMode = self.getRepeatMode(player), state.PlayState.SubtitleOffset = self.getSubtitleOffset(player), state.PlayState.PlaybackRate = self.getPlaybackRate(player), state.PlayState.MaxStreamingBitrate = self.getMaxStreamingBitrate(player), state.PlayState.PositionTicks = getCurrentTicks(player), state.PlayState.PlaybackStartTimeTicks = self.playbackStartTime(player), state.PlayState.SubtitleStreamIndex = self.getSubtitleStreamIndex(player), state.PlayState.AudioStreamIndex = self.getAudioStreamIndex(player), state.PlayState.BufferedRanges = self.getBufferedRanges(player), state.PlayState.PlayMethod = self.playMethod(player), mediaSource && (state.PlayState.LiveStreamId = mediaSource.LiveStreamId), state.PlayState.PlaySessionId = self.playSessionId(player), state.PlaylistItemId = self.getCurrentPlaylistItemId(player), state.PlaylistIndex = self.getCurrentPlaylistIndex(player), state.PlaylistLength = self.getCurrentPlaylistLength(player)),
			mediaSource && (state.PlayState.MediaSourceId = mediaSource.Id, state.NowPlayingItem = {
				RunTimeTicks: mediaSource.RunTimeTicks
			},
			state.PlayState.CanSeek = 0 < (mediaSource.RunTimeTicks || 0) || canPlayerSeek(player)),
			item && (state.NowPlayingItem = function(player, item, mediaSource) {
				var duration, nowPlayingItem = Object.assign({},
				item);
				return nowPlayingItem.playOptions = null,
				delete nowPlayingItem.playOptions,
				mediaSource && (nowPlayingItem.RunTimeTicks = mediaSource.RunTimeTicks, nowPlayingItem.MediaStreams = mediaSource.MediaStreams, nowPlayingItem.MediaSources = null, delete nowPlayingItem.MediaSources),
				nowPlayingItem.RunTimeTicks || (duration = player.duration()) && (nowPlayingItem.RunTimeTicks = 1e4 * duration),
				nowPlayingItem
			} (player, item, mediaSource)),
			state.MediaSource = mediaSource,
			state
		},
		self.duration = function(player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) return player.duration();
			if (!player) throw new Error("player cannot be null");
			var mediaSource = self.currentMediaSource(player);
			if (mediaSource && mediaSource.RunTimeTicks) return mediaSource.RunTimeTicks;
			var playerDuration = player.duration();
			return playerDuration && (playerDuration *= 1e4),
			playerDuration
		},
		self.getCurrentTicks = getCurrentTicks,
		self.getPlaybackMediaSources = function(item, options) {
			var startPosition = (options = options || {}).startPositionTicks || 0,
			mediaType = options.mediaType || item.MediaType,
			player = getPlayer(item, options, !0),
			apiClient = connectionManager.getApiClient(item);
			return apiClient.getEndpointInfo().then(function() {
				var maxBitrate = getSavedMaxStreamingBitrate(connectionManager.getApiClient(item), mediaType);
				return player.getDeviceProfile(item).then(function(deviceProfile) {
					return getPlaybackInfo(player, apiClient, item, deviceProfile, maxBitrate, startPosition, !1, null, null, null, null, null).then(function(playbackInfoResult) {
						return playbackInfoResult.MediaSources
					})
				})
			})
		},
		self.setCurrentPlaylistItem = function(playlistItemId, player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.setCurrentPlaylistItem(playlistItemId);
			for (var newItem, newItemIndex, playlist = self._playQueueManager.getPlaylist(), i = 0, length = playlist.length; i < length; i++) if (playlist[i].PlaylistItemId === playlistItemId) {
				newItem = playlist[i],
				newItemIndex = i;
				break
			}
			if (newItem) {
				var newItemPlayOptions = newItem.playOptions || {};
				return playInternal(newItem, newItemPlayOptions,
				function() {
					setPlaylistState(newItem.PlaylistItemId, newItemIndex)
				})
			}
			return Promise.reject()
		},
		self.removeFromPlaylist = function(playlistItemIds, player) {
			if (!playlistItemIds) throw new Error("Invalid playlistItemIds");
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.removeFromPlaylist(playlistItemIds);
			var removeResult = self._playQueueManager.removeFromPlaylist(playlistItemIds);
			if ("empty" === removeResult.result) return self.stop(player);
			var isCurrentIndex = removeResult.isCurrentIndex;
			return events.trigger(player, "playlistitemremove", [{
				PlaylistItemIds: playlistItemIds
			}]),
			isCurrentIndex ? self.setCurrentPlaylistItem(self._playQueueManager.getPlaylist()[0].PlaylistItemId, player) : Promise.resolve()
		},
		self.movePlaylistItem = function(playlistItemId, newIndex, player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.movePlaylistItem(playlistItemId, newIndex);
			var moveResult = self._playQueueManager.movePlaylistItem(playlistItemId, newIndex);
			"noop" !== moveResult.result && events.trigger(player, "playlistitemmove", [{
				playlistItemId: moveResult.playlistItemId,
				newIndex: moveResult.newIndex
			}])
		},
		self.getCurrentPlaylistIndex = function(player) {
			return (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) ? player.getCurrentPlaylistIndex() : self._playQueueManager.getCurrentPlaylistIndex()
		},
		self.getCurrentPlaylistLength = function(player) {
			return (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) ? player.getCurrentPlaylistLength() : self._playQueueManager.getCurrentPlaylistLength()
		},
		self.getCurrentPlaylistItemId = function(player) {
			return (player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player) ? player.getCurrentPlaylistItemId() : self._playQueueManager.getCurrentPlaylistItemId()
		},
		self.channelUp = function(player) {
			return player = player || self._currentPlayer,
			self.nextTrack(player)
		},
		self.channelDown = function(player) {
			return player = player || self._currentPlayer,
			self.previousTrack(player)
		},
		self.nextTrack = function(player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.nextTrack();
			var newItemPlayOptions, newItemInfo = self._playQueueManager.getNextItemInfo();
			newItemInfo && (console.log("playing next track"), (newItemPlayOptions = newItemInfo.item.playOptions || {}).startPositionTicks = 0, playInternal(newItemInfo.item, newItemPlayOptions,
			function() {
				setPlaylistState(newItemInfo.item.PlaylistItemId, newItemInfo.index)
			}))
		},
		self.previousTrack = function(player) {
			if ((player = player || self._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.previousTrack();
			var newItem, newItemPlayOptions, newIndex = self.getCurrentPlaylistIndex(player) - 1;
			0 <= newIndex && ((newItem = self._playQueueManager.getPlaylist()[newIndex]) && ((newItemPlayOptions = newItem.playOptions || {}).startPositionTicks = 0, playInternal(newItem, newItemPlayOptions,
			function() {
				setPlaylistState(newItem.PlaylistItemId, newIndex)
			})))
		},
		self.queue = function(options, player) {
			return queue(options, "", player)
		},
		self.queueNext = function(options, player) {
			return queue(options, "next", player)
		},
		events.on(pluginManager, "registered",
		function(e, plugin) {
			"mediaplayer" === plugin.type && initMediaPlayer(plugin)
		}),
		pluginManager.ofType("mediaplayer").map(initMediaPlayer),
		self.onAppClose = function() {
			var player = this._currentPlayer;
			player && this.isPlaying(player) && (this._playNextAfterEnded = !1, onPlaybackStopped.call(player))
		},
		self.playbackStartTime = function(player) {
			if ((player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) return player.playbackStartTime();
			var streamInfo = getPlayerData(player).streamInfo;
			return streamInfo ? streamInfo.playbackStartTimeTicks: null
		},
		apphost.supports("remotecontrol") && require(["serverNotifications"],
		function(serverNotifications) {
			events.on(serverNotifications, "ServerShuttingDown", self.setDefaultPlayerActive.bind(self)),
			events.on(serverNotifications, "ServerRestarting", self.setDefaultPlayerActive.bind(self))
		})
	}
	return PlaybackManager.prototype.getCurrentPlayer = function() {
		return this._currentPlayer
	},
	PlaybackManager.prototype.currentTime = function(player) {
		return ! (player = player || this._currentPlayer) || enableLocalPlaylistManagement(player) || player.isLocalPlayer ? this.getCurrentTicks(player) : player.currentTime()
	},
	PlaybackManager.prototype.nextItem = function(player) {
		if ((player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.nextItem();
		var nextItem = this._playQueueManager.getNextItemInfo();
		if (!nextItem || !nextItem.item) return Promise.reject();
		var apiClient = connectionManager.getApiClient(nextItem.item.ServerId);
		return apiClient.getItem(apiClient.getCurrentUserId(), nextItem.item.Id)
	},
	PlaybackManager.prototype.canQueue = function(item) {
		return "MusicAlbum" === item.Type || "MusicArtist" === item.Type || "MusicGenre" === item.Type ? this.canQueueMediaType("Audio") : this.canQueueMediaType(item.MediaType)
	},
	PlaybackManager.prototype.canQueueMediaType = function(mediaType) {
		return !! this._currentPlayer && this._currentPlayer.canPlayMediaType(mediaType)
	},
	PlaybackManager.prototype.isMuted = function(player) {
		return !! (player = player || this._currentPlayer) && player.isMuted()
	},
	PlaybackManager.prototype.setMute = function(mute, player) { (player = player || this._currentPlayer) && player.setMute(mute)
	},
	PlaybackManager.prototype.toggleMute = function(mute, player) { (player = player || this._currentPlayer) && (player.toggleMute ? player.toggleMute() : player.setMute(!player.isMuted()))
	},
	PlaybackManager.prototype.nextChapter = function(player) {
		player = player || this._currentPlayer;
		var item = this.currentItem(player),
		ticks = this.getCurrentTicks(player),
		nextChapter = (item.Chapters || []).filter(function(i) {
			return i.StartPositionTicks > ticks
		})[0];
		nextChapter ? this.seek(nextChapter.StartPositionTicks, player) : this.nextTrack(player)
	},
	PlaybackManager.prototype.previousChapter = function(player) {
		player = player || this._currentPlayer;
		var item = this.currentItem(player),
		ticks = this.getCurrentTicks(player);
		ticks -= 1e8,
		0 === this.getCurrentPlaylistIndex(player) && (ticks = Math.max(ticks, 0));
		var previousChapters = (item.Chapters || []).filter(function(i) {
			return i.StartPositionTicks <= ticks
		});
		previousChapters.length ? this.seek(previousChapters[previousChapters.length - 1].StartPositionTicks, player) : this.previousTrack(player)
	},
	PlaybackManager.prototype.fastForward = function(player) {
		var offsetTicks;
		null == (player = player || this._currentPlayer).fastForward ? (offsetTicks = 1e4 * userSettings.skipForwardLength(), this.seekRelative(offsetTicks, player)) : player.fastForward(userSettings.skipForwardLength())
	},
	PlaybackManager.prototype.rewind = function(player) {
		var offsetTicks;
		null == (player = player || this._currentPlayer).rewind ? (offsetTicks = 0 - 1e4 * userSettings.skipBackLength(), this.seekRelative(offsetTicks, player)) : player.rewind(userSettings.skipBackLength())
	},
	PlaybackManager.prototype.seekPercent = function(percent, player) {
		player = player || this._currentPlayer;
		var ticks = this.duration(player) || 0;
		ticks *= percent /= 100,
		this.seek(parseInt(ticks), player)
	},
	PlaybackManager.prototype.playTrailers = function(item) {
		var player = this._currentPlayer;
		if (player && player.playTrailers) return player.playTrailers(item);
		var apiClient = connectionManager.getApiClient(item),
		instance = this;
		if (item.LocalTrailerCount) return apiClient.getLocalTrailers(apiClient.getCurrentUserId(), item.Id).then(function(result) {
			return instance.play({
				items: result
			})
		});
		var remoteTrailers = item.RemoteTrailers || [];
		return remoteTrailers.length ? this.play({
			items: remoteTrailers.map(function(t) {
				return {
					Name: t.Name || item.Name + " Trailer",
					Url: t.Url,
					MediaType: "Video",
					Type: "Trailer",
					ServerId: apiClient.serverId()
				}
			})
		}) : Promise.reject()
	},
	PlaybackManager.prototype.getSubtitleUrl = function(textStream, serverId) {
		var apiClient = connectionManager.getApiClient(serverId);
		return textStream.IsExternalUrl ? textStream.DeliveryUrl: apiClient.getUrl(textStream.DeliveryUrl)
	},
	PlaybackManager.prototype.stop = function(player) {
		return (player = player || this._currentPlayer) ? (enableLocalPlaylistManagement(player) && (this._playNextAfterEnded = !1), player.stop(!0, !0)) : Promise.resolve()
	},
	PlaybackManager.prototype.getBufferedRanges = function(player) {
		return (player = player || this._currentPlayer) && player.getBufferedRanges ? player.getBufferedRanges() : []
	},
	PlaybackManager.prototype.playPause = function(player) {
		if (player = player || this._currentPlayer) return player.playPause ? player.playPause() : player.paused() ? this.unpause(player) : this.pause(player)
	},
	PlaybackManager.prototype.paused = function(player) {
		if (player = player || this._currentPlayer) return player.paused()
	},
	PlaybackManager.prototype.pause = function(player) { (player = player || this._currentPlayer) && player.pause()
	},
	PlaybackManager.prototype.unpause = function(player) { (player = player || this._currentPlayer) && player.unpause()
	},
	PlaybackManager.prototype.instantMix = function(item, player) {
		if ((player = player || this._currentPlayer) && player.instantMix) return player.instantMix(item);
		var apiClient = connectionManager.getApiClient(item),
		options = {};
		options.UserId = apiClient.getCurrentUserId(),
		options.Limit = 500;
		var instance = this;
		apiClient.getInstantMixFromItem(item.Id, options).then(function(result) {
			instance.play({
				items: result.Items
			})
		})
	},
	PlaybackManager.prototype.shuffle = function(shuffleItem, player, queryOptions) {
		return (player = player || this._currentPlayer) && player.shuffle ? player.shuffle(shuffleItem) : ((queryOptions = queryOptions || {}).items = [shuffleItem], queryOptions.shuffle = !0, this.play(queryOptions))
	},
	PlaybackManager.prototype.audioTracks = function(player) {
		if ((player = player || this._currentPlayer).audioTracks) {
			var result = player.audioTracks();
			if (result) return result
		}
		return ((this.currentMediaSource(player) || {}).MediaStreams || []).filter(function(s) {
			return "Audio" === s.Type
		})
	},
	PlaybackManager.prototype.subtitleTracks = function(player) {
		if ((player = player || this._currentPlayer).subtitleTracks) {
			var result = player.subtitleTracks();
			if (result) return result
		}
		return ((this.currentMediaSource(player) || {}).MediaStreams || []).filter(function(s) {
			return "Subtitle" === s.Type
		})
	},
	PlaybackManager.prototype.getSupportedCommands = function(player) {
		if (! (player = player || this._currentPlayer) || player.isLocalPlayer) {
			var list = ["GoHome", "GoToSettings", "VolumeUp", "VolumeDown", "Mute", "Unmute", "ToggleMute", "SetVolume", "SetAudioStreamIndex", "SetSubtitleStreamIndex", "RefreshMediaSource", "SetMaxStreamingBitrate", "DisplayContent", "GoToSearch", "DisplayMessage", "SetRepeatMode", "PlayMediaSource", "PlayTrailers"];
			return apphost.supports("fullscreenchange") && list.push("ToggleFullscreen"),
			player && player.supports && (player.supports("PictureInPicture") && list.push("PictureInPicture"), player.supports("SetBrightness") && list.push("SetBrightness"), player.supports("SetAspectRatio") && list.push("SetAspectRatio"), player.supports("SetSubtitleOffset") && list.push("SetSubtitleOffset"), player.supports("SetPlaybackRate") && list.push("SetPlaybackRate")),
			list
		}
		var info = this.getPlayerInfo(player);
		return info ? info.supportedCommands: []
	},
	PlaybackManager.prototype.setRepeatMode = function(value, player) {
		if ((player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player)) return player.setRepeatMode(value);
		this._playQueueManager.setRepeatMode(value),
		events.trigger(player, "repeatmodechange")
	},
	PlaybackManager.prototype.getRepeatMode = function(player) {
		return (player = player || this._currentPlayer) && !enableLocalPlaylistManagement(player) ? player.getRepeatMode() : this._playQueueManager.getRepeatMode()
	},
	PlaybackManager.prototype.setSubtitleOffset = function(value, player) { (player = player || this._currentPlayer).setSubtitleOffset && player.setSubtitleOffset(value),
		events.trigger(player, "subtitleoffsetchange")
	},
	PlaybackManager.prototype.incrementSubtitleOffset = function(value, player) { (player = player || this._currentPlayer).incrementSubtitleOffset && (player.incrementSubtitleOffset(value), events.trigger(player, "subtitleoffsetchange"))
	},
	PlaybackManager.prototype.getSubtitleOffset = function(player) {
		return (player = player || this._currentPlayer).getSubtitleOffset ? player.getSubtitleOffset() : 0
	},
	PlaybackManager.prototype.getPlaybackRate = function(player) {
		return (player = player || this._currentPlayer).getPlaybackRate ? player.getPlaybackRate() : 1
	},
	PlaybackManager.prototype.setPlaybackRate = function(value, player) { (player = player || this._currentPlayer).setPlaybackRate && player.setPlaybackRate(value)
	},
	PlaybackManager.prototype.trySetActiveDeviceName = function(name) {
		name = normalizeName(name);
		var instance = this;
		instance.getTargets().then(function(result) {
			var target = result.filter(function(p) {
				return normalizeName(p.name) === name
			})[0];
			target && instance.trySetActivePlayer(target.playerName, target)
		})
	},
	PlaybackManager.prototype.displayContent = function(options, player) { (player = player || this._currentPlayer) && player.displayContent && player.displayContent(options)
	},
	PlaybackManager.prototype.beginPlayerUpdates = function(player) {
		player.beginPlayerUpdates && player.beginPlayerUpdates()
	},
	PlaybackManager.prototype.endPlayerUpdates = function(player) {
		player.endPlayerUpdates && player.endPlayerUpdates()
	},
	PlaybackManager.prototype.setDefaultPlayerActive = function() {
		this.setActivePlayer("localplayer")
	},
	PlaybackManager.prototype.removeActivePlayer = function(name) {
		var playerInfo = this.getPlayerInfo();
		playerInfo && playerInfo.playerName === name && this.setDefaultPlayerActive()
	},
	PlaybackManager.prototype.removeActiveTarget = function(id) {
		var playerInfo = this.getPlayerInfo();
		playerInfo && playerInfo.id === id && this.setDefaultPlayerActive()
	},
	PlaybackManager.prototype.sendCommand = function(cmd, player) {
		switch (console.log("MediaController received command: " + cmd.Name), cmd.Name) {
		case "SetPlaybackRate":
			this.setPlaybackRate(cmd.Arguments.PlaybackRate, player);
			break;
		case "SetSubtitleOffset":
			this.setSubtitleOffset(cmd.Arguments.SubtitleOffset, player);
			break;
		case "IncrementSubtitleOffset":
			this.incrementSubtitleOffset(cmd.Arguments.Increment, player);
			break;
		case "SetRepeatMode":
			this.setRepeatMode(cmd.Arguments.RepeatMode, player);
			break;
		case "VolumeUp":
			this.volumeUp(player);
			break;
		case "VolumeDown":
			this.volumeDown(player);
			break;
		case "Mute":
			this.setMute(!0, player);
			break;
		case "Unmute":
			this.setMute(!1, player);
			break;
		case "ToggleMute":
			this.toggleMute(player);
			break;
		case "SetVolume":
			this.setVolume(cmd.Arguments.Volume, player);
			break;
		case "SetAspectRatio":
			this.setAspectRatio(cmd.Arguments.AspectRatio, player);
			break;
		case "SetBrightness":
			this.setBrightness(cmd.Arguments.Brightness, player);
			break;
		case "SetAudioStreamIndex":
			this.setAudioStreamIndex(parseInt(cmd.Arguments.Index), player);
			break;
		case "SetSubtitleStreamIndex":
			this.setSubtitleStreamIndex(parseInt(cmd.Arguments.Index), player, cmd.Arguments.RefreshMediaSource);
			break;
		case "SetMaxStreamingBitrate":
			break;
		case "ToggleFullscreen":
			this.toggleFullscreen(player);
			break;
		default:
			player.sendCommand && player.sendCommand(cmd)
		}
	},
	new PlaybackManager
});