"use strict";

var fs = require('fs-extra');
var path = require('path');
var crypto = require('crypto');
var sanitizeHtml = require('sanitize-html');
var moment = require('moment');
var async = require('async');

var fetch = require('./fetch');
var rss = require('./rss');
var render = require('./render');

module.exports = function (config) {
    var posts = [];
    async.eachSeries(config['people'], function (c, callback) {
        fetch(c.link, config, function(ps) {
            ps.forEach(function (p) {
                posts.push(parsepost(p, c.avatar, config));
            });
            callback();
        });
    }, function () {
        posts.sort(function (a, b) {
            // newest on top
            return b._u - a._u;
        });
        fs.ensureDir(config.BASEPATH + config['planet'].output, function (err) {
            if (err) {
                console.error('[ERROR] Establishing output directory ' + config.BASEPATH + config['planet'].output);
                process.exit(1);
            }
            rss(posts, config);
            render(posts, config);
        });
    });
};

function parsepost (post, avatar, config) {
    moment.locale(config['planet'].locale);
    var host = post.meta.link.substring(post.meta.link.length, post.meta.link.length - 1) === '/' ?
        post.meta.link.substring(0, post.meta.link.length - 1) : post.meta.link;
    var date = moment(post.pubdate).format(config['planet'].time_format);
    var update = post.date === post.pubdate ? null : moment(post.date).format(config['planet'].time_format);
    var _u = update ? moment(post.date).unix() : moment(post.pubdate).unix();
    return {
        _u: _u,
        title: post.title,
        author: post.author,
        date: date,
        update: update,
        categories: post.categories,
        link: post.origlink ? post.origlink : post.link,
        summary: post.summary,
        content: sanitizeHtml(post.description, {
            allowedTags: config['secure'].allowedTags,
            allowedAttributes: config['secure'].allowedAttributes,
            selfClosing: config['secure'].selfClosing,
            allowedSchemes: config['secure'].allowedSchemes,
            allowProtocolRelative: config['secure'].allowProtocolRelative,
            parser: {
                lowerCaseTags: true
            },
            transformTags: {
                // restore origin links
                'img': function (tagName, attribs) {
                    if (attribs && attribs.src) {
                        if (attribs.src.startsWith('/') && attribs.src.charAt(1) !== '/') {
                            return {
                                tagName: tagName,
                                attribs: {
                                    src: host + attribs.src
                                }
                            };
                        } else if (attribs.src.startsWith('//') ||
                            attribs.src.startsWith('http://') ||
                            attribs.src.startsWith('https://')) {
                            return {
                                tagName: tagName,
                                attribs: attribs
                            };
                        } else {
                            // relative path not correct?
                            return {
                                tagName: tagName,
                                attribs: {
                                    src: host + '/' + attribs.src
                                }
                            };
                        }
                    }
                    return {
                        tagName: tagName,
                        attribs: attribs
                    };
                },
                'a': function (tagName, attribs) {
                    if (attribs && attribs.href) {
                        if (attribs.href.startsWith('#')) {
                            return {
                                tagName: tagName,
                                attribs: {
                                    href: post.link + attribs.href
                                }
                            }
                        } else if (attribs.href.startsWith('/') && attribs.href.charAt(1) !== '/') {
                            return {
                                tagName: tagName,
                                attribs: {
                                    href: host + attribs.href
                                }
                            }
                        }
                    }
                    return {
                        tagName: tagName,
                        attribs: attribs
                    };
                }
            }
        }),
        channel: post.meta.link,
        xml: host + post.meta.xmlurl,
        avatar: avatar ? avatarlink(avatar) : null
    };
}

function avatarlink (avatar) {
    var p_email = new RegExp(/^\w+@[a-zA-Z_]+?\.[a-zA-Z]{2,3}$/i);
    return p_email.test(avatar) ?
        'https://www.gravatar.com/avatar/' + crypto.createHash('md5').update(avatar.toLowerCase()).digest("hex") : avatar;
}