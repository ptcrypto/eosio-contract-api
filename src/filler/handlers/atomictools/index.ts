import * as fs from 'fs';
import { PoolClient } from 'pg';

import { ContractHandler } from '../interfaces';
import { ShipBlock } from '../../../types/ship';
import { EosioTableRow } from '../../../types/eosio';
import { ContractDBTransaction } from '../../database';
import ConnectionManager from '../../../connections/manager';
import { PromiseEventHandler } from '../../../utils/event';
import logger from '../../../utils/winston';

export type DelphiOracleArgs = {
    atomictools_account: string
};

export default class DelphiOracleHandler extends ContractHandler {
    static handlerName = 'delphioracle';

    readonly args: DelphiOracleArgs;

    config: {
        version: string
    };

    constructor(connection: ConnectionManager, events: PromiseEventHandler, args: {[key: string]: any}) {
        super(connection, events, args);

        if (typeof args.delphioracle_account !== 'string') {
            throw new Error('DelphiOracle: Argument missing in atomicmarket handler: delphioracle_account');
        }

        this.scope = {
            actions: [],
            tables: [
                {
                    filter: this.args.atomictools_account + ':*',
                    deserialize: true
                }
            ]
        };
    }

    async init(client: PoolClient): Promise<void> {
        const existsQuery = await client.query(
            'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)',
            [await this.connection.database.schema(), 'delphioracle_pairs']
        );

        if (!existsQuery.rows[0].exists) {
            logger.info('Could not find AtomicTools tables. Create them now...');

            await client.query(fs.readFileSync('./definitions/tables/atomictools_tables.sql', {
                encoding: 'utf8'
            }));

            logger.info('AtomicTools tables successfully created');
        }
    }

    async deleteDB(client: PoolClient): Promise<void> {
        const tables = ['atomictools_links', 'atomictools_links_assets', 'atomictools_config'];

        for (const table of tables) {
            await client.query(
                'DELETE FROM ' + client.escapeIdentifier(table) + ' WHERE tools_contract = $1',
                [this.args.atomictools_account]
            );
        }
    }

    async onTableChange(db: ContractDBTransaction, block: ShipBlock, delta: EosioTableRow): Promise<void> {

    }

    async onAction(): Promise<void> { }

    async onBlockComplete(db: ContractDBTransaction, _: ShipBlock): Promise<void> {

    }

    async onCommit(): Promise<void> { }
}
