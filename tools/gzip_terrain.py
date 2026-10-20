import gzip, os, shutil
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
for name in ['terrain', 'terrain_mid', 'terrain_coarse']:
    src = os.path.join(DATA, name + '.bin')
    dst = src + '.gz'
    with open(src, 'rb') as f_in, gzip.open(dst, 'wb', compresslevel=9) as f_out:
        shutil.copyfileobj(f_in, f_out)
    print(name, round(os.path.getsize(src)/1048576,1), 'MB ->', round(os.path.getsize(dst)/1048576,2), 'MB')
