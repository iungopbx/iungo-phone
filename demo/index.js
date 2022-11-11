const SIP = require('sip.js');
const $ = require('jquery');

window.jQuery = $;
window.SIP = SIP;

$(function() {
    const SDK = require('@iungo/sdk').SDK;
    const WebPhone = require('iungo-web-phone') || window.Iungo.IungoWebPhone;

    /** @type {SDK} */
    var sdk = null;
    var platform = null;
    /** @type {WebPhone} */
    var webPhone = null;

    var logLevel = 0;
    var username = null;
    var extension = null;
    var $app = $('#app');

    var $loginTemplate = $('#template-login');
    var $authFlowTemplate = $('#template-auth-flow');
    var $callTemplate = $('#template-call');
    var $incomingTemplate = $('#template-incoming');
    var $acceptedTemplate = $('#template-accepted');

    var remoteVideoElement = document.getElementById('remoteVideo');
    var localVideoElement = document.getElementById('localVideo');
    var outboundCall = true;
    var confSessionId = '';

    /**
     * @param {jQuery|HTMLElement} $tpl
     * @return {jQuery|HTMLElement}
     */
    function cloneTemplate($tpl) {
        return $($tpl.html());
    }

    function login(server, clientId, clientSecret, username, extension, password, ll) {
        sdk = new SDK({
            clientId,
            clientSecret,
            server
        });

        platform = sdk.platform();

        // TODO: Improve later to support international phone number country codes better
        if (username) {
            username = username.match(/^[+1]/) ? username : '1' + username;
            username = username.replace(/\W/g, '');
        }

        platform
            .login({
                username,
                extension: extension || null,
                password
            })
            .then(function() {
                return postLogin(server, clientId, clientSecret, username, extension, password, ll);
            })
            .catch(function(e) {
                console.error(e.stack || e);
            });
    }

    // Redirect function
    function show3LeggedLogin(server, clientId, clientSecret, ll) {
        var $redirectUri = decodeURIComponent(window.location.href.split('login', 1) + 'callback.html');

        console.log('The redirect uri value :', $redirectUri);

        sdk = new SDK({
            clientId,
            clientSecret,
            server,
            redirectUri: $redirectUri
        });

        platform = sdk.platform();

        var loginUrl = platform.loginUrl();

        platform
            .loginWindow({url: loginUrl}) // this method also allows to supply more options to control window position
            .then(platform.login.bind(platform))
            .then(function() {
                return postLogin(server, clientId, clientSecret, '', '', '', ll);
            })
            .catch(function(e) {
                console.error(e.stack || e);
            });
    }

    function postLogin(server, clientId, clientSecret, username, ext, password, ll) {
        logLevel = ll;

        localStorage.setItem('webPhoneServer', server || '');
        localStorage.setItem('webPhoneclientId', clientId || '');
        localStorage.setItem('webPhoneclientSecret', clientSecret || '');
        localStorage.setItem('webPhoneLogin', username || '');
        localStorage.setItem('webPhoneExtension', ext || '');
        localStorage.setItem('webPhonePassword', password || '');
        localStorage.setItem('webPhoneLogLevel', logLevel || 0);

        return platform
            .get('/restapi/v1.0/account/~/extension/~')
            .then(res => res.json())
            .then(function(res) {
                extension = res;
                console.log('Extension info', extension);

                return platform.post('/restapi/v1.0/client-info/sip-provision', {
                    sipInfo: [
                        {
                            transport: 'WSS'
                        }
                    ]
                });
            })
            .then(res => res.json())
            .then(register)
            .then(makeCallForm)
            .catch(function(e) {
                console.error('Error in main promise chain');
                console.error(e.stack || e);
            });
    }

    function register(data) {
        webPhone = new WebPhone(data, {
            enableDscp: true,
            clientId: localStorage.getItem('webPhoneclientId'),
            audioHelper: {
                enabled: true,
                incoming: 'audio/incoming.ogg',
                outgoing: 'audio/outgoing.ogg'
            },
            logLevel: parseInt(logLevel, 10),
            appName: 'IungoWebPhone',
            appVersion: '5.2.0',
            media: {
                remote: remoteVideoElement,
                local: localVideoElement
            },
            enableQos: true,
            enableMediaReportLogging: true
            // enableTurnServers: true or false,
            // turnServers: [{urls:'turn:192.168.0.1', username : 'turn' , credential: 'turn'}],
            // iceTransportPolicy: "all" or "relay",
            // iceCheckingTimeout:500
        });
        window.webPhone = webPhone; // for debugging

        webPhone.userAgent.audioHelper.setVolume(0.3);
        webPhone.userAgent.on('invite', onInvite);
        webPhone.userAgent.on('connecting', function() {
            console.log('UA connecting');
        });
        webPhone.userAgent.on('connected', function() {
            console.log('UA Connected');
        });
        webPhone.userAgent.on('disconnected', function() {
            console.log('UA Disconnected');
        });
        webPhone.userAgent.on('registered', function() {
            console.log('UA Registered');
        });
        webPhone.userAgent.on('unregistered', function() {
            console.log('UA Unregistered');
        });
        webPhone.userAgent.on('registrationFailed', function() {
            console.log('UA RegistrationFailed', arguments);
        });
        webPhone.userAgent.on('message', function() {
            console.log('UA Message', arguments);
        });
        webPhone.userAgent.transport.on('switchBackProxy', function() {
            console.log('switching back to primary outbound proxy');
            webPhone.userAgent.transport.reconnect(true);
        });
        webPhone.userAgent.transport.on('closed', function() {
            console.log('WebSocket closed.');
        });
        webPhone.userAgent.transport.on('transportError', function() {
            console.log('WebSocket transportError occured');
        });
        webPhone.userAgent.transport.on('wsConnectionError', function() {
            console.log('WebSocket wsConnectionError occured');
        });
        return webPhone;
    }

    function onInvite(session) {
        outboundCall = false;
        console.log('EVENT: Invite', session.request);
        console.log('To', session.request.to.displayName, session.request.to.friendlyName);
        console.log('From', session.request.from.displayName, session.request.from.friendlyName);

        if (session.request.headers['Alert-Info'] && session.request.headers['Alert-Info'][0].raw === 'Auto Answer') {
            session
                .accept()
                .then(function() {
                    onAccepted(session);
                })
                .catch(function(e) {
                    console.error('Accept failed', e.stack || e);
                });
        } else {
            var $modal = cloneTemplate($incomingTemplate).modal({
                backdrop: 'static'
            });

            $modal.find('.answer').on('click', function() {
                $modal.find('.before-answer').css('display', 'none');
                $modal.find('.answered').css('display', '');
                session
                    .accept()
                    .then(function() {
                        $modal.modal('hide');
                        onAccepted(session);
                    })
                    .catch(function(e) {
                        console.error('Accept failed', e.stack || e);
                    });
            });

            $modal.find('.decline').on('click', function() {
                session.reject();
                $modal.modal('hide');
            });

            $modal.find('.toVoicemail').on('click', function() {
                session.toVoicemail();
                $modal.modal('hide');
            });

            $modal.find('.forward-form').on('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session
                    .forward(
                        $modal
                            .find('input[name=forward]')
                            .val()
                            .trim()
                    )
                    .then(function() {
                        console.log('Forwarded');
                        $modal.modal('hide');
                    })
                    .catch(function(e) {
                        console.error('Forward failed', e.stack || e);
                    });
            });

            $modal.find('.reply-form').on('submit', function(e) {
                e.preventDefault();
                e.stopPropagation();
                session
                    .replyWithMessage({
                        replyType: 0,
                        replyText: $modal.find('input[name=reply]').val()
                    })
                    .then(function() {
                        console.log('Replied');
                        $modal.modal('hide');
                    })
                    .catch(function(e) {
                        console.error('Reply failed', e.stack || e);
                    });
            });

            session.on('rejected', function() {
                $modal.modal('hide');
            });
        }
    }

    const activeCallInfoTemplate = () => ({
        id: '',
        from: '',
        to: '',
        direction: '',
        sipData: {
            toTag: '',
            fromTag: ''
        }
    });

    function captureActiveCallInfo(session) {
        const direction = outboundCall ? 'Outbound' : 'Inbound';
        var activeCallInfo = activeCallInfoTemplate();
        activeCallInfo.from = session.request.from.uri.user;
        activeCallInfo.to = session.request.to.uri.user;
        activeCallInfo.direction = direction;
        activeCallInfo.id = session.dialog.id.callId;
        activeCallInfo.sipData.fromTag = session.dialog.remoteTag;
        activeCallInfo.sipData.toTag = session.dialog.localTag;
        if (!localStorage.getItem('activeCallInfo')) {
            localStorage.setItem('activeCallInfo', JSON.stringify(activeCallInfo));
        }
    }

    function onAccepted(session) {
        console.log('EVENT: Accepted', session.request);
        console.log('To', session.request.to.displayName, session.request.to.friendlyName);
        console.log('From', session.request.from.displayName, session.request.from.friendlyName);

        var $modal = cloneTemplate($acceptedTemplate).modal();

        var $info = $modal.find('.info').eq(0);
        var $dtmf = $modal.find('input[name=dtmf]').eq(0);
        var $transfer = $modal.find('input[name=transfer]').eq(0);
        var $flip = $modal.find('input[name=flip]').eq(0);
        var $conference = $modal.find('input[name=conference]').eq(0);

        var interval = setInterval(function() {
            var time = session.startTime ? Math.round((Date.now() - session.startTime) / 1000) + 's' : 'Ringing';
            $info.text('time: ' + time + '\nstartTime: ' + JSON.stringify(session.startTime, null, 2) + '\n');
        }, 1000);

        function close() {
            clearInterval(interval);
            $modal.modal('hide');
        }

        $modal.find('.increase-volume').on('click', function() {
            session.userAgent.audioHelper.setVolume(
                (session.userAgent.audioHelper.volume !== null ? session.userAgent.audioHelper.volume : 0.5) + 0.1
            );
        });

        $modal.find('.decrease-volume').on('click', function() {
            session.userAgent.audioHelper.setVolume(
                (session.userAgent.audioHelper.volume !== null ? session.userAgent.audioHelper.volume : 0.5) - 0.1
            );
        });

        $modal.find('.mute').on('click', function() {
            session.mute();
        });

        $modal.find('.unmute').on('click', function() {
            session.unmute();
        });

        $modal.find('.hold').on('click', function() {
            session
                .hold()
                .then(function() {
                    console.log('Holding');
                })
                .catch(function(e) {
                    console.error('Holding failed', e.stack || e);
                });
        });

        $modal.find('.unhold').on('click', function() {
            session
                .unhold()
                .then(function() {
                    console.log('UnHolding');
                })
                .catch(function(e) {
                    console.error('UnHolding failed', e.stack || e);
                });
        });
        $modal.find('.startRecord').on('click', function() {
            session
                .startRecord()
                .then(function() {
                    console.log('Recording Started');
                })
                .catch(function(e) {
                    console.error('Recording Start failed', e.stack || e);
                });
        });

        $modal.find('.stopRecord').on('click', function() {
            session
                .stopRecord()
                .then(function() {
                    console.log('Recording Stopped');
                })
                .catch(function(e) {
                    console.error('Recording Stop failed', e.stack || e);
                });
        });

        $modal.find('.park').on('click', function() {
            session
                .park()
                .then(function() {
                    console.log('Parked');
                })
                .catch(function(e) {
                    console.error('Park failed', e.stack || e);
                });
        });

        $modal.find('.transfer-form').on('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            session
                .transfer($transfer.val().trim())
                .then(function() {
                    console.log('Transferred');
                    $modal.modal('hide');
                })
                .catch(function(e) {
                    console.error('Transfer failed', e.stack || e);
                });
        });

        $modal.find('.transfer-form button.warm').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            session.hold().then(function() {
                console.log('Placing the call on hold, initiating attended transfer');
                var newSession = session.userAgent.invite($transfer.val().trim());
                newSession.once('established', function() {
                    console.log('New call initated. Click Complete to complete the transfer');
                    $modal.find('.transfer-form button.complete').on('click', function(e) {
                        session
                            .warmTransfer(newSession)
                            .then(function() {
                                console.log('Warm transfer completed');
                            })
                            .catch(function(e) {
                                console.error('Transfer failed', e.stack || e);
                            });
                    });
                });
            });
        });

        $modal.find('.flip-form').on('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            session
                .flip($flip.val().trim())
                .then(function() {
                    console.log('Flipped');
                })
                .catch(function(e) {
                    console.error('Flip failed', e.stack || e);
                });
            $flip.val('');
        });

        $modal.find('.dtmf-form').on('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();
            session.dtmf($dtmf.val().trim());
            $dtmf.val('');
        });

        var $startConfButton = $modal.find('.startConf');

        $startConfButton.on('click', function(e) {
            initConference();
        });

        $modal.find('.hangup').on('click', function() {
            session.dispose();
        });

        session.on('established', function() {
            console.log('Event: Established');
            captureActiveCallInfo(session);
        });
        session.on('progress', function() {
            console.log('Event: Progress');
        });
        session.on('rejected', function() {
            console.log('Event: Rejected');
            close();
        });
        session.on('failed', function() {
            console.log('Event: Failed', arguments);
            close();
        });
        session.on('terminated', function() {
            console.log('Event: Terminated');
            localStorage.setItem('activeCallInfo', '');
            close();
        });
        session.on('cancel', function() {
            console.log('Event: Cancel');
            close();
        });
        session.on('refer', function() {
            console.log('Event: Refer');
            close();
        });
        session.on('replaced', function(newSession) {
            console.log('Event: Replaced: old session', session, 'has been replaced with', newSession);
            close();
            onAccepted(newSession);
        });
        session.on('dtmf', function() {
            console.log('Event: DTMF');
        });
        session.on('muted', function() {
            console.log('Event: Muted');
        });
        session.on('unmuted', function() {
            console.log('Event: Unmuted');
        });
        session.on('connecting', function() {
            console.log('Event: Connecting');
        });
        session.on('bye', function() {
            console.log('Event: Bye');
            close();
        });
    }

    function makeCall(number, homeCountryId) {
        outboundCall = true;
        homeCountryId =
            homeCountryId ||
            (extension &&
                extension.regionalSettings &&
                extension.regionalSettings.homeCountry &&
                extension.regionalSettings.homeCountry.id) ||
            null;

        var session = webPhone.userAgent.invite(number, {
            fromNumber: username,
            homeCountryId
        });

        onAccepted(session);
    }

    function switchCall() {
        var activeCallItem = JSON.parse(localStorage.getItem('activeCallInfo'));
        console.log('Switching active call to current tab: ', activeCallItem);
        var session = webPhone.userAgent.switchFrom(activeCallItem);
        onAccepted(session);
    }

    var onConference = false;

    function initConference() {
        if (!onConference) {
            getPresenceActiveCalls()
                .then(res => res.json())
                .then(response => {
                    var pId = response.activeCalls[0].partyId;
                    var tId = response.activeCalls[0].telephonySessionId;
                    getConfVoiceToken(pId, tId).then(voiceToken => {
                        startConferenceCall(voiceToken, pId, tId);
                        onConference = true;
                    });
                });
        }
    }

    function getPresenceActiveCalls() {
        return platform.get('/restapi/v1.0/account/~/extension/~/presence?detailedTelephonyState=true');
    }

    function getConfVoiceToken(pId, tId) {
        return platform
            .post('/restapi/v1.0/account/~/telephony/conference', {})
            .then(res => res.json())
            .then(res => {
                confSessionId = res.session.id;
                return res.session.voiceCallToken;
            });
    }

    function startConferenceCall(number, pId, tId) {
        var session = webPhone.userAgent.invite(number, {
            fromNumber: username
        });
        session.on('established', function() {
            onAccepted(session);
            console.log('Conference call started');
            bringIn(tId, pId)
                .then(res => res.json())
                .then(response => {
                    console.log('Adding call to conference succesful', response);
                })
                .catch(function(e) {
                    console.error('Conference call failed', e.stack || e);
                });
        });
    }

    function bringIn(tId, pId) {
        var url = '/restapi/v1.0/account/accountId/telephony/sessions/' + confSessionId + '/parties/bring-in';
        return platform.post(url, {
            telephonySessionId: tId,
            partyId: pId
        });
    }

    function makeCallForm() {
        var $form = cloneTemplate($callTemplate);

        var $number = $form.find('input[name=number]').eq(0);
        var $homeCountry = $form.find('input[name=homeCountry]').eq(0);
        var $username = $form.find('.username').eq(0);
        var $logout = $form.find('.logout').eq(0);
        var $switch = $form.find('.switch').eq(0);

        $username.html(
            '<dl>' +
                '<dt>Contact</dt><dd>' +
                extension.contact.firstName +
                ' ' +
                extension.contact.lastName +
                '</dd>' +
                '<dt>Company</dt><dd>' +
                (extension.contact.company || '?') +
                '</dd>' +
                '<dt>Phone Number</dt><dd>' +
                username +
                '</dd>' +
                '</dl>'
        );

        $logout.on('click', function(e) {
            webPhone.userAgent.unregister();
            e.preventDefault();
            location.reload();
        });

        $switch.on('click', function(e) {
            switchCall();
        });

        $number.val(localStorage.getItem('webPhoneLastNumber') || '');

        $form.on('submit', function(e) {
            e.preventDefault();
            e.stopPropagation();

            localStorage.setItem('webPhoneLastNumber', $number.val() || '');

            makeCall($number.val(), $homeCountry.val());
        });

        $app.empty().append($form);
    }

    function makeLoginForm() {
        var $form = cloneTemplate($loginTemplate);
        var $authForm = cloneTemplate($authFlowTemplate);

        var $server = $authForm.find('input[name=server]').eq(0);
        var $clientId = $authForm.find('input[name=clientId]').eq(0);
        var $clientSecret = $authForm.find('input[name=clientSecret]').eq(0);
        var $username = $form.find('input[name=username]').eq(0);
        var $ext = $form.find('input[name=extension]').eq(0);
        var $password = $form.find('input[name=password]').eq(0);
        var $logLevel = $authForm.find('select[name=logLevel]').eq(0);

        $server.val(localStorage.getItem('webPhoneServer') || SDK.server.sandbox);
        $clientId.val(localStorage.getItem('webPhoneclientId') || '');
        $clientSecret.val(localStorage.getItem('webPhoneclientSecret') || '');
        $username.val(localStorage.getItem('webPhoneLogin') || '');
        $ext.val(localStorage.getItem('webPhoneExtension') || '');
        $password.val(localStorage.getItem('webPhonePassword') || '');
        $logLevel.val(localStorage.getItem('webPhoneLogLevel') || logLevel);

        $form.on('submit', function(e) {
            console.log('Normal Flow');

            e.preventDefault();
            e.stopPropagation();

            login(
                $server.val(),
                $clientId.val(),
                $clientSecret.val(),
                $username.val(),
                $ext.val(),
                $password.val(),
                $logLevel.val()
            );
        });
        //
        $authForm.on('submit', function(e) {
            console.log('Authorized Flow');

            e.preventDefault();
            e.stopPropagation();

            show3LeggedLogin($server.val(), $clientId.val(), $clientSecret.val(), $logLevel.val());
        });

        $app.empty()
            .append($authForm)
            .append($form);
    }

    makeLoginForm();
});
