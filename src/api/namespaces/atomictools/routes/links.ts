import * as express from 'express';
import { Numeric } from 'eosjs/dist';

import { AtomicToolsNamespace } from '../index';
import { HTTPServer } from '../../../server';
import { getOpenAPI3Responses, paginationParameters } from '../../../docs';
import logger from '../../../../utils/winston';
import { fillLinks } from '../filler';
import { formatLink } from '../format';
import { filterQueryArgs } from '../../utils';
import { LinkState } from '../../../../filler/handlers/atomictools';

export function linksEndpoints(core: AtomicToolsNamespace, server: HTTPServer, router: express.Router): any {
    router.get('/v1/links', server.web.caching(), async (req, res) => {
        try {
            const args = filterQueryArgs(req, {
                creator: {type: 'string', min: 1},
                claimer: {type: 'string', min: 1},
                public_key: {type: 'string', min: 1},
                state: {type: 'string'},

                page: {type: 'int', min: 1, default: 1},
                limit: {type: 'int', min: 1, max: 100, default: 100},
                sort: {type: 'string', values: ['created'], default: 'created'},
                order: {type: 'string', values: ['asc', 'desc'], default: 'desc'}
            });

            let queryString = 'SELECT * FROM atomictools_links_master listing WHERE tools_contract = $1 ';
            const queryValues: any[] = [core.args.atomictools_account];
            let varCounter = queryValues.length;

            if (args.creator) {
                queryString += 'AND creator = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.creator.split(','));
            }

            if (args.claimer) {
                queryString += 'AND claimer = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.claimer.split(','));
            }

            if (args.public_key) {
                try {
                    const key = Numeric.stringToPublicKey(args.public_key);

                    queryString += 'AND key_type = $' + ++varCounter + ' AND key_data = $' + ++varCounter + ' ';
                    queryValues.push(key.type.valueOf());
                    queryValues.push(key.data);
                } catch (e) { }
            }

            if (args.state) {
                queryString += 'AND state = ANY ($' + ++varCounter + ') ';
                queryValues.push(args.state.split(','));
            }

            const sortColumnMapping = {
                created: 'created_at_block'
            };

            // @ts-ignore
            queryString += 'ORDER BY ' + sortColumnMapping[args.sort] + ' ' + args.order + ' ';
            queryString += 'LIMIT $' + ++varCounter + ' OFFSET $' + ++varCounter + ' ';
            queryValues.push(args.limit);
            queryValues.push((args.page - 1) * args.limit);

            logger.debug(queryString);

            const query = await core.connection.database.query(queryString, queryValues);

            const links = await fillLinks(
                core.connection, core.args.atomicassets_account, query.rows.map((row) => formatLink(row))
            );

            res.json({success: true, data: links, query_time: Date.now()});
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    router.get('/v1/links/:link_id', server.web.caching(), async (req, res) => {
        try {
            const query = await core.connection.database.query(
                'SELECT * FROM atomictools_links_master WHERE tools_contract = $1 AND link_id = $2',
                [core.args.atomictools_account, req.params.link_id]
            );

            if (query.rowCount === 0) {
                res.status(416).json({success: false, message: 'Link not found'});
            } else {
                const links = await fillLinks(
                    core.connection, core.args.atomicassets_account, query.rows.map((row) => formatLink(row))
                );

                res.json({success: true, data: links[0], query_time: Date.now()});
            }
        } catch (e) {
            logger.error(req.originalUrl + ' ', e);

            res.status(500).json({success: false, message: 'Internal Server Error'});
        }
    });

    return {
        tag: {
            name: 'links',
            description: 'Share Links'
        },
        paths: {
            '/v1/links': {
                get: {
                    tags: ['links'],
                    summary: 'Get all links',
                    parameters: [
                        {
                            name: 'creator',
                            in: 'query',
                            description: 'Link Creator',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'claimer',
                            in: 'query',
                            description: 'Claimer of the link if it was claimed',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'public_key',
                            in: 'query',
                            description: 'Public key which is used to share the assets',
                            required: false,
                            schema: {type: 'string'}
                        },
                        {
                            name: 'state',
                            in: 'query',
                            description: 'Filter by link state (' +
                                LinkState.WAITING.valueOf() + ': WAITING - Link created but items were not transferred yet, ' +
                                LinkState.CREATED.valueOf() + ': CREATED - Link is pending, ' +
                                LinkState.CANCELED.valueOf() + ': CANCELED - Creator canceled link, ' +
                                LinkState.CLAIMED.valueOf() + ': CLAIMED - Link was claimed, ' +
                                ') - separate multiple with ","',
                            required: false,
                            schema: {type: 'string'}
                        },
                        ...paginationParameters,
                        {
                            name: 'sort',
                            in: 'query',
                            description: 'Column to sort',
                            required: false,
                            schema: {
                                type: 'string',
                                enum: ['created'],
                                default: 'created'
                            }
                        }
                    ],
                    responses: getOpenAPI3Responses([500, 200], {
                        type: 'array',
                        items: {'$ref': '#/components/schemas/Link'}
                    })
                }
            },
            '/v1/links/{link_id}': {
                get: {
                    tags: ['links'],
                    summary: 'Get a specific link by id',
                    parameters: [
                        {
                            in: 'path',
                            name: 'link_id',
                            description: 'Link Id',
                            required: true,
                            schema: {type: 'integer'}
                        }
                    ],
                    responses: getOpenAPI3Responses([200, 416, 500], {'$ref': '#/components/schemas/Link'})
                }
            }
        }
    };
}